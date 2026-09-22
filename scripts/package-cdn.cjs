// Runs in the public repository. Never packages the repository wholesale.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const files=['delivery-info.js','reserved-shipping.js','purchase-benefit-dustuff.js','reserved-shipping.css','purchase-benefit-dustuff.css','demo/index.html'];
const manifest=JSON.parse(fs.readFileSync(path.join(root,'release.json'),'utf8'));
if(!/^[a-f0-9]{40}$/.test(manifest.sourceCommit)||Object.keys(manifest.files).sort().join('|')!==[...files].sort().join('|'))throw Error('Invalid release manifest');
for(const file of files){
  const data=fs.readFileSync(path.join(root,file));
  if(crypto.createHash('sha256').update(data).digest('hex')!==manifest.files[file])throw Error('Release hash mismatch: '+file);
  const target=path.join(root,'_site',file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data);
}
fs.copyFileSync(path.join(root,'release.json'),path.join(root,'_site/release.json'));
fs.writeFileSync(path.join(root,'_site/.nojekyll'),'');
console.log('Verified release '+manifest.sourceCommit);
