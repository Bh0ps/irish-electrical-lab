import http from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const candidates=['out','dist/client','dist'];
const directory=candidates.map(p=>path.join(project,p)).find(p=>existsSync(path.join(p,'index.html')));
if(!directory){console.error('The production app is not built. Run the build command described in README.');process.exit(1);}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.wasm':'application/wasm'};
const port=Number(process.env.ELECTRICAL_LAB_PORT||4173);
const server=http.createServer((request,response)=>{
  if(request.url?.split('?')[0]==='/__electrical_lab_health'){response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify({app:'irish-electrical-lab',version:1}));return;}
  let pathname;try{pathname=decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname);}catch{response.writeHead(400);response.end('Invalid request');return;}
  let file=path.resolve(directory,'.'+pathname);if(!file.startsWith(directory+path.sep)&&file!==directory){response.writeHead(403);response.end('Forbidden');return;}
  if(existsSync(file)&&statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!existsSync(file)&&!path.extname(pathname)&&existsSync(file.replace(/[\\/]$/,'')+'.html'))file=file.replace(/[\\/]$/,'')+'.html';
  if(!existsSync(file)&&!path.extname(pathname))file=path.join(directory,'index.html');
  if(!existsSync(file)){response.writeHead(404);response.end('Not found');return;}
  response.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});response.end(readFileSync(file));
});
server.on('error',error=>{console.error(error.message);process.exit(1);});
server.listen(port,'127.0.0.1',()=>console.log(`Irish Electrical Lab: http://127.0.0.1:${port}`));
