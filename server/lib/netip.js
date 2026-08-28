import os from 'node:os';

// Best-guess LAN IPv4 for the laptop. Prefers the Windows Mobile Hotspot range
// (192.168.137.x) since that's the demo network, then other private ranges.
export function lanIp() {
  const ifaces = os.networkInterfaces();
  const addrs = [];
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal) addrs.push({ name, address: ni.address });
    }
  }
  const score = (a) => {
    if (a.address.startsWith('192.168.137.')) return 0; // Windows hotspot
    if (/hotspot|mobile|local area connection\*/i.test(a.name)) return 1;
    if (a.address.startsWith('192.168.')) return 2;
    if (a.address.startsWith('10.')) return 3;
    if (a.address.startsWith('172.')) return 4;
    return 9;
  };
  addrs.sort((x, y) => score(x) - score(y));
  return addrs[0]?.address || '127.0.0.1';
}
