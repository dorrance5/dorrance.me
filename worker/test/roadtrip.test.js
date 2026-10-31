const test=require('node:test'), assert=require('node:assert/strict');
const makeApi=require('./harness.cjs'), T=require('../../roadtrip/data.js');
const car=id=>({op:'car',id,name:id,tank:15,notes:'',archived:false});
async function setup(){
 const api=await makeApi('{"recipes":[]}');
 await api.addUser('Nicole','nicole-password');
 const login=async(name,password)=>(await(await api.call('http://x/api/auth/login',{method:'POST',body:JSON.stringify({name,password})})).json()).token;
 const as=token=>T.api(token,(url,opts)=>api.call('http://x'+url,opts));
 return {api,a:as(await login('Mitchell',api.ADMIN_PASSWORD)),b:as(await login('Nicole','nicole-password'))};
}
test('authentication, private households, read-only GET and atomic invalid-batch rejection',async()=>{
 const {api,a,b}=await setup();
 assert.equal((await api.call('http://x/api/roadtrip')).status,401);
 const before=api.kv.puts.length; await a.get(); await a.people(); assert.equal(api.kv.puts.length,before);
 await a.send([car('Joseph')]); assert.equal((await b.get()).cars.length,0);
 await assert.rejects(a.send([car('Pilot'),{op:'bad'}]),e=>e.code==='body');
 assert.deepEqual((await a.get()).cars.map(c=>c.name),['Joseph']);
});
test('joining carries solo cars; leaving keeps independent copies for both people',async()=>{
 const {a,b}=await setup(); await a.send([car('Joseph')]); await b.send([car('Pilot')]);
 await a.share('ask','nicole'); assert.equal((await b.get()).share.invite.key,'mitchell');
 const joined=await b.share('join'); assert.equal(joined.cars.length,2); assert.equal(joined.people.length,2);
 await b.send([car('Third')]); assert.equal((await a.get()).cars.length,3);
 await b.share('leave'); await b.send([{op:'uncar',id:'Joseph'}]);
 assert.equal((await a.get()).cars.length,3); assert.equal((await b.get()).cars.length,2);
});
test('cancel and decline invalidate invitations; KV failures leave saved cars intact',async()=>{
 const {api,a,b}=await setup(); await a.share('ask','nicole'); await a.share('cancel');
 await assert.rejects(b.share('join'),e=>e.code==='gone');
 await a.share('ask','nicole'); await b.share('decline'); assert.equal((await a.get()).share.asked,null);
 await a.send([car('Joseph')]); api.kv.kvFail.push('429 Too Many Requests');
 await assert.rejects(a.send([car('Pilot')]),e=>e.code==='busy'); assert.equal((await a.get()).cars.length,1);
 api.kv.kvFail.push('daily limit exceeded'); await assert.rejects(a.send([car('Pilot')]),e=>e.code==='full');
});
