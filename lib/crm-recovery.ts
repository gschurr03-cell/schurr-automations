// Runs before the CRM client modules. A missing deployment chunk must not leave
// a silent, apparently usable page. Reload remains an explicit owner action.
export const CRM_RECOVERY_SCRIPT = String.raw`(function(){
  if(window.__schurrRecoveryInstalled)return;
  window.__schurrRecoveryInstalled=true;
  var ready=false;
  function show(){var banner=document.getElementById('crm-load-recovery');if(banner)banner.hidden=false;}
  window.addEventListener('crm:outreach-ready',function(){ready=true;var banner=document.getElementById('crm-load-recovery');if(banner)banner.hidden=true;});
  window.addEventListener('error',function(event){var target=event.target;var url=target&&(target.src||target.href)||'';if(url.indexOf('/_next/static/')!==-1)show();},true);
  window.addEventListener('unhandledrejection',function(event){var reason=event.reason;var message=String(reason&&reason.message||reason||'');if(/Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk .* failed|ChunkLoadError/i.test(message))show();});
  if(location.pathname==='/manage/outreach')setTimeout(function(){if(!ready)show();},12000);
})();`;
