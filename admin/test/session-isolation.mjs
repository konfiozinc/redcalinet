import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();const checks=[];
const check=(name,value)=>{assert.ok(value,name);checks.push(name)};
async function login(email){await page.locator('#login-form input[name=email]').fill(email);await page.locator('#login-form input[name=password]').fill('RCL-Only-QA-2026!');await page.getByRole('button',{name:'Entrar al panel',exact:true}).click();await page.locator('.stats').waitFor();}
try{
await page.goto('http://127.0.0.1:5176/admin/');await login('superadmin@rcl.example.test');
await page.locator('.sidebar nav').getByRole('button',{name:'Auditoría',exact:true}).click();await page.getByRole('heading',{name:'Auditoría',exact:true}).waitFor();await page.locator('.loading').waitFor({state:'hidden'});
check('SUPERADMIN can open real audit view',await page.locator('.activity').count()>0);
await page.route('**/admin/api/productos',r=>r.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'QA: sesión invalidada'})}));
await page.getByRole('button',{name:'↻ Actualizar',exact:true}).click();await page.locator('#login-form').waitFor();check('401 invalidation removes private shell',await page.locator('#shell').count()===0);
await page.unroute('**/admin/api/productos');await login('admin@rcl.example.test');
check('different account starts on dashboard, not cached audit',await page.getByRole('heading',{name:'Todo listo para avanzar.',exact:true}).isVisible());
check('PROPIETARIO cannot see audit or user controls',await page.locator('.sidebar nav [data-view=auditoria],.sidebar nav [data-view=usuarios]').count()===0);
await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await page.locator('#login-form').waitFor();await login('superadmin@rcl.example.test');
let release,ready;const held=new Promise(r=>release=r),started=new Promise(r=>ready=r);
await page.route('**/admin/api/usuarios',async r=>{const response=await r.fetch();ready();await held;await r.fulfill({response});});
await page.locator('.sidebar nav').getByRole('button',{name:'Usuarios y permisos',exact:true}).click();await started;
await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await page.locator('#login-form').waitFor();await login('admin@rcl.example.test');
release();await page.unroute('**/admin/api/usuarios',{behavior:'wait'});
check('late previous-account response does not restore privileged view',await page.getByRole('heading',{name:'Todo listo para avanzar.',exact:true}).isVisible()&&await page.locator('.sidebar nav [data-view=usuarios]').count()===0);
await page.route('**/admin/api/productos',r=>r.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:'QA: permisos revocados'})}));
await page.getByRole('button',{name:'↻ Actualizar',exact:true}).click();await page.locator('#login-form').waitFor();check('403 permission invalidation clears private shell',await page.locator('#shell').count()===0);await page.unroute('**/admin/api/productos');await login('superadmin@rcl.example.test');check('role recovery starts on clean dashboard',await page.getByRole('heading',{name:'Todo listo para avanzar.',exact:true}).isVisible());
await fs.writeFile(new URL('../.runtime/session-isolation-results.json',import.meta.url),JSON.stringify({passed:checks.length,checks,scope:'Real emulator accounts; deliberate 401 fault and delayed real server response'},null,2));console.log('PASS:',checks.length,'session isolation checks');
}finally{await browser.close();}
