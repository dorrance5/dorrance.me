// Shared check: every visible .seg button, .tabs button, .chip and .homelink link can be hit over a 44px-tall area
// (the look may be smaller; an invisible ::before makes up the rest). Returns the misses.
module.exports = async function tap44(page) {
  return page.evaluate(() => {
    const miss = [];
    const top = document.querySelector('.sheet') || document;   // a sheet covers the page under it
    for (const el of top.querySelectorAll('.seg button, .tabs button, .chip, .homelink a')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden' || el.closest('[hidden]')) continue;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (cx < 0 || cx > innerWidth || cy < 22 || cy > innerHeight - 22) continue;     // not fully on screen
      const hit = dy => { const t = document.elementFromPoint(cx, cy + dy); return t && (t === el || el.contains(t) || !!t.closest('button, a')); };   // a neighbouring control shares the gap
      if (r.height < 43.5 && !(hit(-21.5) && hit(21.5))) miss.push((hit(-21.5)?'':'T:'+(document.elementFromPoint(cx,cy-21.5)||{}).className+' ')+(hit(21.5)?'':'B:'+(document.elementFromPoint(cx,cy+21.5)||{}).className+' ')+(el.className || el.tagName) + ' ' + Math.round(r.height) + ' ' + (el.textContent || '').trim().slice(0, 14));
    }
    return miss;
  });
};
