import sys
P=dict(
  ax1=-254.19,
  ay1=229.68,
  ax2=281.32,
  ay2=-254.19,
  docL=133.055,
  docR=378.855,
  docT=100.38,
  docB=411.35,
  docR_=16.562,
  docSW=16.5,
  foldX=311.62,
  foldY=167.875,
  foldR=15.062,
  gapT=227.6,
  gapB=295.9,
  chk=((361.85,249.662), (379.11,267.05), (417.275,228.231)),
  chkSW=11.526,
  spL=(341.39, 228.41, 22.337, 2.0, 5.75),
  spS=(321.112, 254.48, 12.0, 0.7, 3.65),
  beamX=73.5,
  beamY=288.6,
  beamW=365.0,
  beamH=7.6,
  bloom=8.0,
  white="#FFFFFF",
  cyan="#8CFCF9",
)
STOPS=[(0.0000,"#00296C"),(0.0625,"#00296B"),(0.1250,"#00286D"),(0.1875,"#00286C"),
(0.2500,"#012B6F"),(0.3125,"#003772"),(0.3750,"#004578"),(0.4375,"#00557D"),
(0.5000,"#006784"),(0.5625,"#007A8B"),(0.6250,"#008E90"),(0.6875,"#009F96"),
(0.7500,"#00AF9A"),(0.8125,"#00BA9E"),(0.8750,"#00BB9F"),(0.9375,"#00BB9F"),(1.0000,"#01BCA0")]
def sparkle(cx,cy,R,e,f):
    # 4-point star: each quadrant is one cubic, symmetric about the 45-deg diagonal.
    # P0=(0,-R) P1=(e,-f) P2=(f,-e) P3=(R,0)  [then rotated 4x about (cx,cy)]
    def rot(px,py,k):
        for _ in range(k): px,py = -py,px
        return px,py
    d=[]
    for k in range(4):
        p0=rot(0,-R,k); p1=rot(e,-f,k); p2=rot(f,-e,k); p3=rot(R,0,k)
        if k==0: d.append(f"M {cx+p0[0]},{cy+p0[1]}")
        d.append(f"C {cx+p1[0]},{cy+p1[1]} {cx+p2[0]},{cy+p2[1]} {cx+p3[0]},{cy+p3[1]}")
    d.append("Z")
    return " ".join(d)
def build(p):
    st="\n".join(f'      <stop offset="{o:.4f}" stop-color="{c}"/>' for o,c in STOPS)
    L,R,T,B,r,sw=p['docL'],p['docR'],p['docT'],p['docB'],p['docR_'],p['docSW']
    fx,fy=p['foldX'],p['foldY']; gT,gB=p['gapT'],p['gapB']
    # outline: starts at gap top on right edge, runs anticlockwise all the way to gap bottom
    outline=(f"M {R},{gT} V {fy} L {fx},{T} H {L+r} A {r},{r} 0 0 0 {L},{T+r} V {B-r} "
             f"A {r},{r} 0 0 0 {L+r},{B} H {R-r} A {r},{r} 0 0 0 {R},{B-r} V {gB}")
    fr=p["foldR"]
    fold=f"M {fx},{T} V {fy-fr} A {fr},{fr} 0 0 0 {fx+fr},{fy} H {R}"
    (c1,c2,c3)=p['chk']
    chk=f"M {c1[0]},{c1[1]} L {c2[0]},{c2[1]} L {c3[0]},{c3[1]}"
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <title>Scan &amp; Action app mark</title>
  <desc>Layered vector master, reconstructed by measurement from the flat 512x512 store icon
  (md5 6b46ba3b40a8f9b9ffb62816242b3223). No vector original ever existed; this file is it.
  Groups are separable: #background is the gradient plate, #mark is the artwork on a
  transparent backdrop and is what the adaptive-icon foreground / splash overlay are cut from.</desc>
  <defs>
    <linearGradient id="bgGrad" gradientUnits="userSpaceOnUse"
                    x1="{p['ax1']}" y1="{p['ay1']}" x2="{p['ax2']}" y2="{p['ay2']}">
{st}
    </linearGradient>
    <filter id="beamBloom" x="-5%" y="-1200%" width="110%" height="2500%"
            color-interpolation-filters="sRGB">
      <feGaussianBlur stdDeviation="0 {p['bloom']}"/>
    </filter>
  </defs>
  <g id="background">
    <rect x="0" y="0" width="512" height="512" fill="url(#bgGrad)"/>
  </g>
  <g id="mark">
    <g id="doc" fill="none" stroke="{p['white']}" stroke-width="{sw}"
       stroke-linecap="butt" stroke-linejoin="round">
      <path id="doc-outline" d="{outline}"/>
      <path id="doc-fold" d="{fold}"/>
    </g>
    <g id="sparkles" fill="{p['white']}">
      <path id="sparkle-lg" d="{sparkle(*p['spL'])}"/>
      <path id="sparkle-sm" d="{sparkle(*p['spS'])}"/>
    </g>
    <path id="check" d="{chk}" fill="none" stroke="{p['cyan']}" stroke-width="{p['chkSW']}"
          stroke-linecap="round" stroke-linejoin="round"/>
    <g id="beam">
      <rect id="beam-glow" x="{p['beamX']}" y="{p['beamY']}" width="{p['beamW']}" height="{p['beamH']}"
            fill="{p['cyan']}" filter="url(#beamBloom)"/>
      <rect id="beam-core" x="{p['beamX']}" y="{p['beamY']}" width="{p['beamW']}" height="{p['beamH']}"
            fill="{p['cyan']}"/>
    </g>
  </g>
</svg>
'''
if __name__=="__main__":
    open(r"D:\RAGHAD JAD\scan-and-action\apps\frontend\assets\scan-action-mark.svg","w").write(build(P))
    print("built")
