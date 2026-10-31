// Road Trip's CSV export, made from cars in this app's shape (test/fixture.json), for the checks. The sections and
// headers are the ones in a real export from the app (Version 2000); the owner's own export is not in the repository.
//   csv(car) -> the text of one car's file      zip([{ name, text }]) -> a Buffer, like the .zip the app shares
const zlib = require('node:zlib');

const FUEL = 'Odometer (mi),Trip Distance,Date,Fill Amount,Fill Units,Price per Unit,Total Price,Partial Fill,MPG,Note,Octane,Location,Payment,Conditions,Reset,Categories,Flags,Currency Code,Currency Rate,Latitude,Longitude,ID,Trip Comp Fuel Economy,Trip Comp Avg. Speed,Trip Comp Temperature,Trip Comp Drive Time,Tank Number';
const MAINT = 'Description,Date,Odometer (mi.),Cost,Note,Location,Type,Subtype,Payment,Categories,Reminder Interval,Reminder Distance,Flags,Currency Code,Currency Rate,Latitude,Longitude,ID,Notification Interval,Notification Distance';
const TRIPS = 'Name,Start Date,Start Odometer (mi.),End Date,End Odometer,Note,Distance,ID,Type,Categories,Flags';
const VEHICLE = 'Name,Odometer,Units,Notes,Tank Capacity,Tank Units,Home Currency,Flags,IconID,FuelUnits,TripComp Units,TripComp Speed,TripComp Temperature,TripComp Time Enabled,Odometer Shift';

const q = s => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
// "2026-08-29" -> "2026-8-29 9:44", the way Road Trip writes a date
const when = (d, i) => { const [y, m, dd] = d.split('-').map(Number); return `${y}-${m}-${dd} ${8 + (i % 12)}:${String((i * 7) % 60).padStart(2, '0')}`; };
const TYPE = { service: 'Service', expense: 'Expense', other: 'Other' };

function csv(car) {
  const fuel = [...car.fuel].sort((a, b) => a.odo - b.odo);
  const out = ['ROAD TRIP CSV ",."', 'Version,Language', '2000,en', '', '', 'FUEL RECORDS', FUEL];
  fuel.forEach((f, i) => {
    const trip = i && !f.reset ? f.odo - fuel[i - 1].odo : '';
    out.push([f.odo, trip, `"${when(f.date, i)}"`, f.gal, 'Gal', f.price, f.total, f.partial ? 'Partial' : '', '', '', '', '', '', '',
      f.reset || !i ? 'Reset' : '', '', i ? 0 : 9, '', 1, '', '', 2 * i + 1, '', '', '', '', 0].join(','));
  });
  out.push('', '', 'MAINTENANCE RECORDS', MAINT);
  car.costs.forEach((c, i) => {
    // A reminder rides on the latest record with its name, as in Road Trip
    const r = car.reminders.find(x => x.name.toLowerCase() === c.name.toLowerCase()
      && !car.costs.some(y => y !== c && y.name.toLowerCase() === c.name.toLowerCase() && y.date > c.date));
    out.push([q(c.name), `"${when(c.date, i)}"`, c.odo ?? '', c.cost || '', q(c.note || ''), '', TYPE[c.kind], '', '', '',
      r && r.months ? `"${r.months}m"` : '', r && r.miles ? r.miles : '', r ? 1 : 0, '', 1, '', '', 2 * i + 1, r ? '"1w"' : '', r ? 100 : ''].join(','));
  });
  out.push('', '', 'ROAD TRIPS', TRIPS, '"Summer trip","2024-6-1",1000,"2024-6-30",2000,,1000,1,Report,,14');
  out.push('', '', 'VEHICLE', VEHICLE, [q(car.name), '"mi"', '"MPG"', q(car.notes || ''), car.tank ?? '', 'gal', 'USD', 'H45', 0, 0, '', '', '', '', ''].join(','));
  out.push('', '', 'TIRE LOG', 'Name,Start Date,Start Odometer (mi.),Size,Size Correction,Distance,Age,Note,Flags,ID,ParentID', '"Default Tires",,,,,1000,"1 year",,0,1,0');
  out.push('', '', 'VALUATIONS', 'Type,Date,Odometer,Price,Notes,Flags', '');
  return out.join('\n');
}

// A .zip with deflated files and a BOM at the start of each, like the one Road Trip shares.
function zip(files) {
  const parts = [], central = [];
  let off = 0;
  for (const f of files) {
    const name = Buffer.from(f.name), raw = Buffer.from('﻿' + f.text), data = zlib.deflateRawSync(raw), crc = zlib.crc32(raw);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8);
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(name.length, 26);
    parts.push(h, name, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(off, 42);
    central.push(c, name);
    off += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}

module.exports = { csv, zip };
