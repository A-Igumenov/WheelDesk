"""Original WheelDesk icon: procedural device silhouette and click wheel (MIT)."""
import math,struct,zlib
from pathlib import Path
N=512
rows=[]
for y in range(N):
 row=bytearray([0])
 for x in range(N):
  # Rounded player body; transparent outside.
  dx=max(94-x,0,x-418);dy=max(62-y,0,y-450)
  inside=(82<=x<=430 and 50<=y<=462 and dx*dx+dy*dy<=12*12)
  c=(0,0,0,0)
  if inside:
   shade=int(54-18*y/N);c=(shade,shade+4,shade+10,255)
   if 108<=x<=404 and 78<=y<=230:c=(219,233,218,255)
   if 126<=x<=310 and 100<=y<=115:c=(32,79,70,255)
   if 126<=x<=385 and 137<=y<=158:c=(67,117,159,255)
   if 126<=x<=276 and 181<=y<=191:c=(79,104,93,255)
   r=math.hypot(x-256,y-340)
   if r<=92:c=(210,214,217,255)
   if r<=33:c=(66,72,80,255)
  row.extend(c)
 rows.append(row)
def chunk(tag,data):return struct.pack('>I',len(data))+tag+data+struct.pack('>I',zlib.crc32(tag+data)&0xffffffff)
data=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',N,N,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(rows),9))+chunk(b'IEND',b'')
Path('assets/app-icon.png').write_bytes(data)
