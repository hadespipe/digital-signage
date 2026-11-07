(function(root){
  var panel=document.getElementById('settings'), form=document.getElementById('form'), server=document.getElementById('server'), token=document.getElementById('token'), lan=document.getElementById('lan'), error=document.getElementById('error'), image=document.getElementById('display'), status=document.getElementById('status');
  var configured=null,player=null,hold=null,check=null,revision=0,settingsEntry=false;
  function open(message){if(panel.hidden&&configured&&!settingsEntry){history.pushState({settings:true},'');settingsEntry=true;}panel.hidden=false;error.textContent=message||'';server.focus();}
  function close(){panel.hidden=true;document.activeElement.blur();if(settingsEntry){settingsEntry=false;history.back();}}
  function returnToPlayback(){stop();server.value=configured.serverUrl;token.value=configured.token;lan.checked=configured.allowLanHttp;start(configured);}
  function stop(){revision++;if(check)check.abort();check=null;if(player)player.stop();player=null;image.hidden=true;image.removeAttribute('src');}
  function start(value){
    stop();configured=value;close();status.hidden=false;status.textContent='Connecting…';
    player=Signage.createPlayer({transport:Signage.createTransport({baseUrl:value.serverUrl,token:value.token}),view:{
      showImage:function(url){image.src=url;image.hidden=false;status.hidden=true;},
      showEmpty:function(){image.hidden=true;status.hidden=false;status.textContent='Please upload';},
      showError:function(){status.textContent='Could not connect';open('Check the connection and TV token, then save to retry.');}
    }});player.start();
  }
  form.addEventListener('submit',function(event){
    event.preventDefault();var value;
    try{value=Signage.validateSettings({serverUrl:server.value.trim(),token:token.value,allowLanHttp:lan.checked});}catch(e){error.textContent=e.message;return;}
    stop();var current=revision;check=new AbortController();var controller=check;
    error.textContent='Checking connection…';
    var timer=setTimeout(function(){controller.abort();},4500);
    Signage.createTransport({baseUrl:value.serverUrl,token:value.token}).getPlaylist(controller.signal).then(function(){
      if(current!==revision)return;
      try{Signage.saveSettings(value);}catch(e){error.textContent='Device storage is unavailable. Check storage and retry.';return;}
      start(value);
    }).catch(function(){if(current===revision)error.textContent='Check the connection and TV token, then save to retry.';}).then(function(){clearTimeout(timer);});
  });
  // Keep LG's default history-based Back behavior enabled. At the root the
  // platform owns Back/exit; the settings state adds one history entry.
  function showSettings(){if(panel.hidden)open();}
  root.addEventListener('popstate',function(){settingsEntry=false;if(!panel.hidden&&configured)returnToPlayback();});
  root.addEventListener('keydown',function(event){
    var key=event.keyCode;
    if(key===13&&event.repeat){event.preventDefault();return;}
    if(key===461){if(!panel.hidden&&configured){event.preventDefault();if(settingsEntry)history.back();else returnToPlayback();}return;}
    if(panel.hidden){
      if(key===13&&!hold){event.preventDefault();hold=setTimeout(function(){hold=null;showSettings();},1500);}
      return;
    }
    var controls=[server,token,lan,form.querySelector('button')],index=controls.indexOf(document.activeElement);
    if(key>=37&&key<=40){event.preventDefault();controls[(index+(key===37||key===38?-1:1)+controls.length)%controls.length].focus();}
    if(key===13){event.preventDefault();if(document.activeElement===lan)lan.checked=!lan.checked;else if(document.activeElement===controls[3])controls[3].click();else document.activeElement.click();}
  });
  root.addEventListener('keyup',function(event){if(event.keyCode===13){clearTimeout(hold);hold=null;}});
  root.addEventListener('blur',function(){clearTimeout(hold);hold=null;});
  try{configured=Signage.loadSettings();if(configured){server.value=configured.serverUrl;token.value=configured.token;lan.checked=configured.allowLanHttp;start(configured);}else open();}catch(e){open('Saved settings or device storage are unavailable. Enter settings and retry.');}
})(globalThis);
