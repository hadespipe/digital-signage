(function(root){
  var signage=root.Signage=root.Signage||{}, key='digital-signage-settings';
  signage.validateSettings=function(value){
    var url;
    try { url=new URL(value.serverUrl); } catch(e) { throw new Error('Enter a valid server URL.'); }
    if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||(url.protocol!=='https:'&&url.protocol!=='http:')) throw new Error('Enter a valid server origin without credentials, path or query.');
    if(url.protocol!=='https:'&&!value.allowLanHttp) throw new Error('HTTPS is required. Enable LAN testing explicitly to use HTTP.');
    if(!value.token||!value.token.trim()) throw new Error('Enter the TV token.');
    return {serverUrl:url.origin,token:value.token,allowLanHttp:!!value.allowLanHttp};
  };
  signage.loadSettings=function(){var raw=root.localStorage.getItem(key);return raw?signage.validateSettings(JSON.parse(raw)):null;};
  signage.saveSettings=function(value){root.localStorage.setItem(key,JSON.stringify(signage.validateSettings(value)));};
})(globalThis);
