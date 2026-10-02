import vinext from 'vinext';
import { defineConfig } from 'vite';
// This local app has no cloud bindings, accounts or connector workers.
export default defineConfig({plugins:[vinext()],server:{host:'127.0.0.1',port:5173,strictPort:true},worker:{format:'es'}});
