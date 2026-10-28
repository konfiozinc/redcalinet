// Deterministic, synthetic blue media for QA only. Never commercial product imagery.
import {spawnSync} from 'node:child_process';import fs from 'node:fs/promises';
const root=new URL('../.runtime/fixtures/',import.meta.url);await fs.mkdir(root,{recursive:true});
for(const args of [['-f','lavfi','-i','color=c=blue:s=320x180:r=12','-t','1','-pix_fmt','yuv420p','-c:v','libx264','-movflags','+faststart','-y',new URL('test.mp4',root).pathname],['-f','lavfi','-i','color=c=blue:s=160x100','-frames:v','1','-y',new URL('test.png',root).pathname]]){const r=spawnSync('ffmpeg',['-hide_banner','-loglevel','error',...args],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr||'ffmpeg unavailable');}console.log('QA fixtures generated; not real advertising media.');
