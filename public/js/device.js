// ═══════════════════════════════════════════════════════════════
//  AirBridge — Device Detection
// ═══════════════════════════════════════════════════════════════

function detectDevice() {
  const ua = navigator.userAgent;

  let name = 'Unknown Device', icon = '💻', os = 'Unknown OS', type = 'desktop';

  if (/iPhone/.test(ua)) {
    const ver = ua.match(/OS ([\d_]+)/);
    name = 'iPhone';
    icon = '📱';
    os = 'iOS ' + (ver ? ver[1].replace(/_/g, '.') : '');
    type = 'mobile';
  } else if (/iPad/.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua))) {
    name = 'iPad';
    icon = '📱';
    os = 'iPadOS';
    type = 'tablet';
  } else if (/Android/.test(ua)) {
    const model = ua.match(/Android[\s\d.]+;\s*([^)]+)\)/);
    const ver = ua.match(/Android ([\d.]+)/);
    name = model ? model[1].split(';')[0].trim() : 'Android Device';
    if (name.length > 20) name = name.split(' ').slice(0, 2).join(' ');
    icon = '📱';
    os = 'Android ' + (ver ? ver[1] : '');
    type = /Mobile/.test(ua) ? 'mobile' : 'tablet';
  } else if (/Windows/.test(ua)) {
    const ver = ua.match(/Windows NT ([\d.]+)/);
    const vmap = { '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7' };
    name = 'Windows PC';
    icon = '🖥️';
    os = 'Windows ' + (ver ? vmap[ver[1]] || ver[1] : '');
    type = 'desktop';
  } else if (/Macintosh|MacIntel/.test(ua)) {
    const ver = ua.match(/Mac OS X ([\d_]+)/);
    name = 'Mac';
    icon = '💻';
    os = 'macOS ' + (ver ? ver[1].replace(/_/g, '.') : '');
    type = 'desktop';
  } else if (/CrOS/.test(ua)) {
    name = 'Chromebook';
    icon = '💻';
    os = 'Chrome OS';
    type = 'desktop';
  } else if (/Linux/.test(ua)) {
    name = 'Linux PC';
    icon = '🖥️';
    os = 'Linux';
    type = 'desktop';
  }

  let browser = 'Browser';
  if (/Edg\//.test(ua))           browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/Chrome\//.test(ua))   browser = 'Chrome';
  else if (/Firefox\//.test(ua))  browser = 'Firefox';
  else if (/Safari\//.test(ua))   browser = 'Safari';

  return { name, icon, os, type, browser };
}
