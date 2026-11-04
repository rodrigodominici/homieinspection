import asyncio,json,os,secrets,zipfile
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(headless=True)
  admin=await b.new_context(viewport={'width':1280,'height':1800});ap=await admin.new_page()
  with open(os.path.expanduser('~/.cache/lovable-auth/session.json')) as f:m=json.load(f)
  await ap.goto('http://localhost:8080');await ap.evaluate('([k,v])=>localStorage.setItem(k,v)',[m['storage_key'],json.dumps(m['session'])])
  password=secrets.token_urlsafe(24); email='hunter.verificacion.'+secrets.token_hex(6)+'@example.invalid'
  result=await ap.evaluate('''async body=>{const {supabase}=await import('/src/integrations/supabase/client.ts');const r=await supabase.functions.invoke('admin-create-user',{body});return {data:r.data,error:r.error?await r.error.context.text():null}}''',{'email':email,'password':password,'full_name':'PRUEBA Hunter temporal','role':'hunter','market':'CL','markets':['CL','MX'],'country_code':'+56','phone':'900000000','is_active':True})
  if result.get('error'):raise Exception(result['error'])
  uid=result['data']['id']
  hc=await b.new_context(viewport={'width':1280,'height':1800},accept_downloads=True);page=await hc.new_page()
  await page.goto('http://localhost:8080/auth')
  r=await page.evaluate('''async args=>{const {supabase}=await import('/src/integrations/supabase/client.ts'); const r=await supabase.auth.signInWithPassword(args);return r.error?.message}''',{'email':email,'password':password})
  if r:raise Exception(r)
  await page.goto('http://localhost:8080/inspections/be4cb30c-84d2-4f50-abc3-fb8286b8beaf')
  await page.get_by_role('heading',name='Fotos de comercialización',exact=True).wait_for()
  await page.get_by_role('button',name='Fotos de comercialización',exact=True).first.click()
  await page.get_by_role('dialog').get_by_text('44 fotos',exact=False).wait_for()
  await page.wait_for_function("Array.from(document.querySelectorAll('[role=dialog] img')).filter(i=>i.complete&&i.naturalWidth>0).length===44",timeout=60000)
  await page.screenshot(path='/tmp/browser/hunter/gallery.png')
  await page.get_by_role('button',name='Preparar ZIP',exact=True).click()
  await page.get_by_role('button',name='Descargar ZIP',exact=True).wait_for(timeout=120000)
  async with page.expect_download() as dl:await page.get_by_role('button',name='Descargar ZIP',exact=True).click()
  await (await dl.value).save_as('/tmp/browser/hunter/photos.zip')
  with zipfile.ZipFile('/tmp/browser/hunter/photos.zip') as z:assert len(z.namelist())==44;print('ZIP real: 44 fotos')
  checks=await page.evaluate('''async()=>{const {supabase}=await import('/src/integrations/supabase/client.ts'); const cl=await supabase.rpc('get_hunter_captaciones',{p_market:'CL'});const mx=await supabase.rpc('get_hunter_captaciones',{p_market:'MX'});const no=await supabase.rpc('set_internal_user_role',{p_user_id:(await supabase.auth.getUser()).data.user.id,p_role:'admin'});return {cl:cl.data?.length,mx:mx.data?.length,blocked:!!no.error}}''')
  print('Acceso Hunter:',json.dumps(checks));assert checks['blocked'];assert checks['cl']>0;assert checks['mx']>0
  await ap.evaluate('''async id=>{const {supabase}=await import('/src/integrations/supabase/client.ts');const r=await supabase.from('profiles').update({is_active:false}).eq('id',id);if(r.error)throw r.error}''',uid)
  blocked=await page.evaluate('''async()=>{const {supabase}=await import('/src/integrations/supabase/client.ts');const r=await supabase.rpc('get_hunter_marketing_photos',{p_captacion_id:'be4cb30c-84d2-4f50-abc3-fb8286b8beaf'});return !!r.error}''');assert blocked;print('Cuenta temporal desactivada; acceso revocado')
  await b.close()
asyncio.run(main())
