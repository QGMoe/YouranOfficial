/* ---------- 3D 体素渲染（手写 WebGL2；固定斜角正交相机） ----------
 * 地形静态网格（逐面 + 顶点 AO，只在固体变化时重建）；液体网格每帧按显示层数重建（只在可见范围）；
 * 光照体 3D 纹理：R 火把/小厅/信标，G 岩浆，B 手持火把可见度（从玩家所在格泛洪，墙后为 0 → 不穿墙）；
 * 镂空：玩家前方、脚面以上的片元剖掉，剖面处画一层“剖切面”（岩石截面），不露黑洞；
 * 被挡/被淹的玩家用轮廓透视；岩浆场景用离屏缓冲做热浪扭曲（reducedMotion 时关闭）。 */
function make3D(canvas, signal) {
  var gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: true, stencil: false, powerPreference: 'low-power' });
  if (!gl) return null;
  var R = { kind: '3d', lost: false, gl: gl }, P1, P2, P3, P4, P5, P6, BEAM = null, ATX, LTX, FB = null, FBT = null, FBD = null, fbW = 0, fbH = 0;
  var TER = null, TERkey = '', TOR = null, TORkey = '', PLT = null, STK = null, PLH = null, PICK = null, CRK = null, CRKkey = '', HEAD_Y = 1.32, PLY = null, PLA = null, PRA = null, PLL = null, PRL = null, BOX = null, FLV = null, FLW = null, PV = null, WV = null, quadVao = null, P7 = null, SKYT = null, IDX = null;
  var NT = 25, LY = 11, sc0 = null, TERnear = null, VIEW = null, lvol = null, lvolDims = [1, 1, 1], lvolLo = 0, lastLight = -1, lightKey = '';
  var fdat = new Float32Array(9 * 4 * 6000), wdat = new Float32Array(9 * 4 * 3000), pdat = new Float32Array(8 * 400), adat = new Float32Array(7 * 4 * 64);
  var Mp = new Float32Array(16), Vm = new Float32Array(16), cpV = [0, 0, 0], CF = [0, -1, 0];
  var HDR = '#version 300 es\nprecision highp float;precision highp sampler3D;\n';
  var LIGHT = 'uniform sampler3D L;uniform vec3 lo,dims,pp,amb,shc;uniform float hr,tm,heatK,dfl;' +
    // 深度雾：俯视时当前层地面（dfl）以下越深越暗——深坑往下能隐约看到下层，但读得出"很深"
    'vec3 dfog(vec3 c,float y){return y<dfl?c*mix(.38,1.,clamp(1.-(dfl-y)*.12,0.,1.)):c;}' +
    'vec4 ls(vec3 p){return texture(L,(p-lo).xzy/dims);}' +
    'vec3 lit(vec3 wp,vec3 n,vec3 alb){vec4 l=ls(wp+n*.45);vec3 hp=pp+vec3(0.,1.25,0.)-wp;float hd=max(length(hp),.001);' +
    'float h=clamp(1.-hd/hr,0.,1.);h=h*h*(.55+.45*max(dot(n,hp/hd),0.))*1.7*l.b;' +
    'vec3 li=amb+l.r*vec3(1.,.82,.55)+l.g*vec3(1.,.45,.15)*1.3+h*vec3(1.,.86,.62);' +
    'float lum=clamp(max(li.r,li.g),0.,1.);return mix(shc,alb*li,smoothstep(0.,.32,lum));}' +
    'float heat(vec3 wp){return clamp(ls(wp+vec3(0.,.5,0.)).g*heatK,0.,1.);}';
  // 岩石顶面（俯视的切面）：按它四周巷道高度上的光照（火把 / 岩浆 / 信标 + 手里火把）明暗，无火把区里同样暗；
  // 岩石内部不进光，所以在巷道中线高度、本格与前后左右各 1 格取最大值；保留一点底光，迷宫走向仍看得清
  var CAPL = 'vec3 capL(vec3 wp){vec3 q=vec3(wp.x,cutY+.48,wp.z);vec4 l=max(max(max(ls(q),ls(q+vec3(1.,0.,0.))),max(ls(q-vec3(1.,0.,0.)),ls(q+vec3(0.,0.,1.)))),ls(q-vec3(0.,0.,1.)));' +
    'vec2 hp=pp.xz-wp.xz;float h=clamp(1.-length(hp)/hr,0.,1.);h=h*h*.9;' +
    'vec3 li=l.r*vec3(1.,.92,.78)+l.g*vec3(1.,.6,.35)*1.1+h*vec3(1.,.92,.78);return vec3(.46)+.66*min(li,vec3(1.1));}';
  // 遮挡墙渐隐：视平面上离人物越近越透明（平滑衰减，无硬边），只作用于比人物更靠近镜头、且高于地面的墙面片元；cutOn 为随时间平滑的遮挡系数
  var CUT = 'uniform vec4 cp;uniform vec3 cf;uniform float cutY,cutOn,fpass;float fadeAt(vec4 vp){vec2 d=(vp.xy-cp.xy)*vec2(1.,1.15);return (1.-smoothstep(.8,2.9,length(d)))*smoothstep(cp.z+.1,cp.z+.9,vp.z)*cutOn;}' +
    // 深坑观察窗：视平面上沿坑口（pa）→ 下层地面（pb）这条线附近、且比坑的中轴更靠近镜头的片元渐隐（含当前层地面与坑壁），从上面就能往下看到下层与坑里的流体
    'uniform vec4 pa,pb;float fadePit(vec4 vp){if(pa.w<.01)return 0.;vec2 ab=pb.xy-pa.xy;float t=clamp(dot(vp.xy-pa.xy,ab)/max(dot(ab,ab),1e-4),0.,1.);float d=length(vp.xy-pa.xy-ab*t);float zz=mix(pa.z,pb.z,t);return (1.-smoothstep(.5,1.15,d))*smoothstep(zz+.08,zz+.28,vp.z)*pa.w;}';
  // tl：整个人的姿态（倒下 / 爬 / 蜷 / 坐）：x 绕身体前向轴侧翻、y 前后俯仰（都以脚为支点），z 上下平移；在四肢摆动之后、朝向之前
  var VS1 = 'in vec3 a_p;in vec3 a_n;in vec2 a_t;in vec4 a_c;uniform mat4 Pm,Vm;uniform vec3 off;uniform float rot;uniform vec4 lp,tl;out vec3 wp;out vec3 nn;out vec2 tc;out vec4 cc;out vec4 vp;' +
    'void main(){float c=cos(rot),s=sin(rot);vec3 p=a_p,n=a_n;float lc=cos(lp.w),ls2=sin(lp.w);p-=lp.xyz;p.xy=vec2(lc*p.x-ls2*p.y,ls2*p.x+lc*p.y);p+=lp.xyz;n.xy=vec2(lc*n.x-ls2*n.y,ls2*n.x+lc*n.y);' +
    'float rc=cos(tl.x),rs=sin(tl.x);p.yz=vec2(rc*p.y-rs*p.z,rs*p.y+rc*p.z);n.yz=vec2(rc*n.y-rs*n.z,rs*n.y+rc*n.z);float qc=cos(tl.y),qs=sin(tl.y);p.xy=vec2(qc*p.x-qs*p.y,qs*p.x+qc*p.y);n.xy=vec2(qc*n.x-qs*n.y,qs*n.x+qc*n.y);p.y+=tl.z;' +
    'p.xz=vec2(c*p.x-s*p.z,s*p.x+c*p.z);n.xz=vec2(c*n.x-s*n.z,s*n.x+c*n.z);wp=p+off;nn=n;tc=a_t;cc=a_c;vp=Vm*vec4(wp,1.);gl_Position=Pm*vp;}';
  var FS1 = 'in vec3 wp;in vec3 nn;in vec2 tc;in vec4 cc;in vec4 vp;uniform sampler2D A;uniform vec3 cap;uniform vec4 tint,ptint;out vec4 o;' + LIGHT + CUT + CAPL +
    'void main(){float fd=fpass>.5?max(wp.y>cutY?fadeAt(vp):0.,fadePit(vp)):0.;' +
    'if(fpass>.5&&fpass<1.5&&fd>.01)discard;' +                       // 不透明遍：渐隐区的片元留给半透明遍
    'if(fpass>1.5&&(fd<=.01||dot(nn,cf)>.01))discard;' +              // 半透明遍：只画渐隐区里朝向镜头的面，避免透出墙背面（先判断再取贴图，省掉大部分片元的开销）
    'vec4 tx=texture(A,tc);if(cc.w<1.5&&tx.a<.5)discard;vec3 alb=cc.w<.5?tx.rgb*cc.rgb:cc.w<1.5?tx.rgb*cap:cc.rgb;' +
    'float sd=nn.y>.5?1.:nn.y<-.5?.5:abs(nn.x)>.5?.82:.66;' +
    'vec3 col=cc.w>2.5?cc.rgb:cc.w>.5&&cc.w<1.5?alb*capL(wp):lit(wp,nn,alb*sd);' +
    'col=mix(col,ptint.rgb,ptint.a);' +                                // 人物身上的色调（失温的霜色 / 被火烤的暖光；只给人物用）
    'if(tint.a>0.){o=vec4(mix(col,tint.rgb,.3),tint.a);return;}' +      // 被挡住部分的透视：保留人物本身配色，只略微提亮
    'if(cc.w<1.5&&tx.a>.6&&tx.a<.9){float tw=step(.82,fract(sin(dot(floor(wp*16.+.01),vec3(12.99,78.23,37.71)))*437.58+tm*.55));col=max(col,tx.rgb*(.78+.4*tw));}' +   // 奇怪的矿石晶粒：自发光 + 轻微闪烁
    'col=dfog(col,wp.y);if(fpass>1.5){o=vec4(col,1.-.8*fd);return;}' +
    'o=vec4(col,heat(wp));}';
  var VS2 = 'in vec3 a_p;in vec3 a_n;in vec3 a_g;uniform mat4 Pm,Vm;out vec3 wp;out vec3 nn;out vec3 gg;out vec4 vp;void main(){wp=a_p;nn=a_n;gg=a_g;vp=Vm*vec4(wp,1.);gl_Position=Pm*vp;}';
  var FS2 = 'in vec3 wp;in vec3 nn;in vec3 gg;in vec4 vp;uniform float lava,alphaL;out vec4 o;' + LIGHT +
    'float hs(vec2 p){return fract(sin(dot(floor(p),vec2(12.9898,78.233)))*43758.5453);}' +
    'void main(){float top=nn.y>.5?1.:0.;float cut=gg.z;if(lava>.5){vec2 q=wp.xz*4.+vec2(tm*.5,tm*.27)+wp.y*3.;float n=hs(q)*.55+hs(q*.5+3.)*.45;' +
    'vec3 c=mix(vec3(.78,.2,.03),vec3(1.,.7,.2),n*n);c*=top>.5?1.:.72;c=mix(c,vec3(1.,.9,.55),gg.x*.35);o=vec4(c,alphaL<.99?alphaL:heat(wp));}' +
    // 水的剖面：不像自由水面——没有高光与泡沫；颜色更深更饱和，加 45° 细斜线（剖面线）与一点抖动，半透明仍看得出是水；明暗跟周围光照（无火把区更暗）
    'else if(cut>.5){vec2 pc=floor(wp.xz*16.);float hatch=step(.5,fract((pc.x+pc.y)/6.))*step(fract((pc.x+pc.y)/6.),.67);float dth=mod(pc.x*3.+pc.y*7.,5.)<1.?.04:0.;' +
    'vec3 c=lit(wp,nn,vec3(.1,.27,.62))*(1.-.22*hatch)+dth;o=vec4(c,.72);}' +
    'else{vec3 c=lit(wp,nn,vec3(.24,.48,.86));vec2 q=wp.xz*5.+vec2(tm*.4,0.);c+=vec3(.16,.2,.26)*step(.93,hs(q))*top;c=mix(c,vec3(.85,.95,1.),gg.x*.5);' +
    'c=dfog(c,wp.y);o=vec4(c,(top>.5?.5:.42)+gg.y*.25);}}';
  var VS3 = 'in vec3 a_p;in float a_s;in vec4 a_c;uniform mat4 Pm,Vm;uniform float ps;out vec4 cc;void main(){gl_Position=Pm*Vm*vec4(a_p,1.);gl_PointSize=ps*a_s;cc=a_c;}';
  var FS3 = 'in vec4 cc;out vec4 o;void main(){o=cc;}';
  var VS4 = 'in vec3 a_p;in vec2 a_u;in vec2 a_k;uniform mat4 Pm,Vm;out vec2 uv;out vec2 kk;void main(){uv=a_u;kk=a_k;gl_Position=Pm*Vm*vec4(a_p,1.);}';
  var FS4 = 'in vec2 uv;in vec2 kk;uniform float tm,ghost;out vec4 o;void main(){float r=length(uv-.5)*2.;float p=kk.x;' +
    'if(kk.y<.5){float a=clamp(1.-r/(.2+p*.7),0.,1.);a=a*a*(.4+.9*p)*(.85+.15*sin(tm*(3.+p*7.)));o=vec4(mix(vec3(1.,.35,.05),vec3(1.,.95,.6),p*a)*a,1.)*ghost;}' +
    'else{float d=clamp(1.-r/(.22+p*.6),0.,1.);float ring=step(.8,fract(r*6.-tm*.8));float a=(step(r,.21)*.5+ring*d*.9)*(.35+.65*p);o=vec4(mix(vec3(.25,.5,.9),vec3(.85,.95,1.),p),a*ghost);}}';
  var VS6 = 'in vec3 a_p;in vec2 a_u;uniform mat4 Pm,Vm;out vec2 uv;void main(){uv=a_u;gl_Position=Pm*Vm*vec4(a_p,1.);}';
  var FS6 = 'in vec2 uv;uniform float tm,rmo;out vec4 o;void main(){float e=1.-abs(uv.x*2.-1.);float core=smoothstep(.55,1.,e),glow=e*e;float fl=rmo>.5?1.:.85+.15*sin(uv.y*.9-tm*4.);float top=1.-smoothstep(.75,1.,uv.y/34.);o=vec4(vec3(.5,1.,.96)*glow*.55+vec3(.9,1.,1.)*core*.7,1.)*fl*top;}';
  var VS5 = 'in vec2 a_p;out vec2 uv;void main(){uv=a_p*.5+.5;gl_Position=vec4(a_p,0.,1.);}';
  var FS7 = 'in vec2 uv;uniform sampler2D S;out vec4 o;void main(){o=vec4(texture(S,vec2(uv.x,1.-uv.y)).rgb,1.);}';   // 出口段的天空远景（整屏贴图）
  // 热浪扭曲：岩浆附近（alpha 通道）+ 过热时全屏轻微扭曲（sh.z）与人物周围更强（sh.xy = 人物在画面里的位置）
  var FS5 = 'in vec2 uv;uniform sampler2D S;uniform vec2 res;uniform float tm;uniform vec3 sh;out vec4 o;void main(){float h=max(texture(S,uv).a,sh.z*(.35+.65*(1.-smoothstep(.04,.22,length((uv-sh.xy)*vec2(res.x/res.y,1.))))));' +
    'vec2 d=vec2(sin(uv.y*res.y*.07+tm*6.)+.5*sin(uv.y*res.y*.19-tm*9.),0.)*h*2.2/res;o=vec4(texture(S,uv+d).rgb,1.);}';
  function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, HDR + src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  function prog(vs, fs) {
    var p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var u = {}; for (var i = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i--;) { var n = gl.getActiveUniform(p, i).name; u[n] = gl.getUniformLocation(p, n); }
    return { p: p, u: u };
  }
  /* ---- 原创像素贴图（程序生成，16×16） ----
   * 0 石 1 地面 2 钻石 3 金 4 红石 5 青金 6 铁 7 煤 8 圆石 9 黑曜石 10 石头 11 木板 12 梯子 13 箱子 14 顶面 15 砂砾 */
  function atlas() {
    var c = document.createElement('canvas'); c.width = 16 * NT; c.height = 16; var g = c.getContext('2d'), s = 7;
    var r = function () { s = (s * 16807) % 2147483647; return s / 2147483647; };
    var px = function (i, x, y, col) { g.fillStyle = col; g.fillRect(i * 16 + x, y, 1, 1); };
    var noise = function (i, base, sp, tint) { for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) { var v = base + ((r() * sp) | 0) - (sp >> 1); px(i, x, y, 'rgb(' + (v + tint[0]) + ',' + (v + tint[1]) + ',' + (v + tint[2]) + ')'); } };
    var ORE = { 2: '#5fe6dc', 3: '#f3d24a', 4: '#d42a1e', 5: '#2f55c8', 6: '#d8a77f', 7: '#262626' };
    for (var i = 0; i < NT; i++) {
      if (i === 11 || i === 12 || i === 13) {
        for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) { var v = (y % 4 === 0 ? -26 : 0) + ((r() * 14) | 0); px(i, x, y, 'rgb(' + (150 + v) + ',' + (108 + v) + ',' + (62 + v) + ')'); }
        if (i === 12) { g.clearRect(i * 16, 0, 16, 16); for (y = 0; y < 16; y++) { px(i, 2, y, '#6e4a2a'); px(i, 3, y, '#86603a'); px(i, 12, y, '#6e4a2a'); px(i, 13, y, '#86603a'); } for (y = 2; y < 16; y += 4) for (x = 2; x < 14; x++) px(i, x, y, (x & 1) ? '#a5773f' : '#94693a'); }
        if (i === 13) { g.fillStyle = '#4a3020'; g.fillRect(i * 16, 6, 16, 1); g.fillRect(i * 16, 0, 1, 16); g.fillRect(i * 16 + 15, 0, 1, 16); g.fillStyle = '#cfcfcf'; g.fillRect(i * 16 + 7, 5, 2, 3); }
        continue;
      }
      if (i === 9) { noise(i, 28, 10, [6, 0, 14]); for (var k = 0; k < 6; k++) { g.fillStyle = '#4b3a6b'; g.fillRect(i * 16 + ((r() * 13) | 0), (r() * 13) | 0, 3, 2); } continue; }
      if (i === 8) { noise(i, 112, 20, [0, 0, 3]); g.fillStyle = '#56585d'; [[0, 4, 16, 1], [0, 10, 16, 1], [5, 0, 1, 4], [11, 4, 1, 6], [3, 10, 1, 6], [9, 10, 1, 6]].forEach(function (q) { g.fillRect(i * 16 + q[0], q[1], q[2], q[3]); }); continue; }
      if (i === 10) { noise(i, 150, 10, [0, 0, 3]); g.fillStyle = '#8c8f94'; g.fillRect(i * 16, 15, 16, 1); g.fillRect(i * 16, 0, 16, 1); continue; }
      if (i === 15) { noise(i, 120, 40, [6, 2, 0]); continue; }
      // 地表（最后一段竖井的出口）：16 泥土、17 草方块侧面（上沿一圈参差的草）、18 草方块顶面
      if (i === 16 || i === 17) { noise(i, 84, 22, [38, 2, -26]); for (k = 0; k < 7; k++) { g.fillStyle = 'rgba(70,46,28,.6)'; g.fillRect(i * 16 + ((r() * 14) | 0), 2 + ((r() * 13) | 0), 2, 1); }
        if (i === 17) for (x = 0; x < 16; x++) { var gh = 3 + ((r() * 3) | 0); for (y = 0; y < gh; y++) px(i, x, y, 'rgb(' + (88 + ((r() * 20) | 0)) + ',' + (150 + ((r() * 24) | 0)) + ',' + (54 + ((r() * 14) | 0)) + ')'); }
        continue; }
      // 19 奇怪的矿石（侧面）、24 奇怪的矿石（剖切顶面）：灰石底 + 粉 / 天蓝 / 奶油色晶粒（参照服主模组里亲手画的 16×16 矿石贴图）；
      // 晶粒像素的 alpha 记为 0.75 → 着色器里自发光、轻微闪烁（减少动态时静止），暗处也不会被压成灰色
      // 20–23 挖掘裂纹的 4 个阶段（透明底，只有裂纹像素）
      if (i === 19 || i === 24) {
        var GR = i === 19 ? ['#7f7f7f', '#747474', '#8f8f8f', '#686868'] : ['#5e5b58', '#55524f', '#66625e', '#4d4a47'];   // 剖切顶面要乘顶面增益，底色压暗与普通顶面一致
        for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) px(i, x, y, GR[(r() * 4) | 0]);
        var SPK = i === 19 ? WEIRD_SPECKS : WEIRD_SPECKS_CAP;
        for (k = 0; k < SPK.length; k++) { var sp = SPK[k]; g.fillStyle = 'rgba(' + sp[2] + ',0.75)'; g.clearRect(i * 16 + sp[0], sp[1], 1, 1); g.fillRect(i * 16 + sp[0], sp[1], 1, 1); }
        continue; }
      if (i >= 20 && i <= 23) {
        var st = i - 19, CR = [[7, 7], [8, 6], [6, 8], [9, 5], [5, 9], [10, 5], [4, 10], [8, 9], [9, 10], [6, 5], [5, 4], [11, 4], [3, 11], [10, 11], [11, 12], [4, 3], [12, 3], [2, 12], [12, 12], [13, 13], [3, 2], [13, 2], [1, 13], [8, 3], [8, 12], [3, 7], [12, 8], [14, 1], [1, 14], [14, 14]];
        for (k = 0; k < Math.round(CR.length * st / 4); k++) px(i, CR[k][0], CR[k][1], 'rgba(18,16,14,0.92)');
        continue; }
      if (i === 18) { for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) { var gv = (r() * 26) | 0; px(i, x, y, 'rgb(' + (84 + gv) + ',' + (146 + gv) + ',' + (50 + (gv >> 1)) + ')'); } continue; }
      noise(i, i === 1 ? 104 : i === 14 ? 92 : 120, i === 14 ? 16 : 22, i === 1 ? [10, 6, 0] : [0, 0, 3]);
      if (ORE[i]) for (k = 0; k < 6; k++) { var ox = 2 + ((r() * 11) | 0), oy = 2 + ((r() * 11) | 0); g.fillStyle = ORE[i]; g.fillRect(i * 16 + ox, oy, 2, 2); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(i * 16 + ox, oy, 1, 1); }
    }
    return c;
  }
  var ORE_TILE = [0, 2, 3, 4, 5, 6, 7];
  // 奇怪的矿石晶粒（x, y, 颜色）：奶油 #fcebd6、粉 #fcb7da、天蓝 #3ac5fd、白（按服主贴图的晶粒排布）
  var WC = { c: '252,235,214', p: '252,183,218', b: '58,197,253', w: '255,255,255' };
  var WEIRD_SPECKS = [[4, 2, WC.c], [12, 2, WC.c], [13, 2, WC.p], [7, 3, WC.c], [8, 3, WC.b], [5, 5, WC.w], [6, 5, WC.c], [10, 5, WC.w], [11, 5, WC.c], [3, 6, WC.w], [4, 6, WC.c],
    [5, 6, WC.p], [6, 6, WC.p], [7, 6, WC.b], [10, 6, WC.p], [11, 6, WC.b], [1, 8, WC.c], [2, 8, WC.p], [8, 8, WC.w], [9, 8, WC.c], [7, 9, WC.c], [8, 9, WC.b], [9, 9, WC.b], [10, 9, WC.b],
    [4, 10, WC.p], [11, 11, WC.c], [12, 11, WC.b], [8, 12, WC.c], [9, 12, WC.w], [10, 12, WC.c], [11, 12, WC.p], [12, 12, WC.p], [13, 12, WC.b], [3, 13, WC.c], [4, 13, WC.b], [9, 13, WC.b], [10, 13, WC.b]];
  var WEIRD_SPECKS_CAP = WEIRD_SPECKS.filter(function (s2, k2) { return k2 % 2 === 0; }).map(function (s2) { return [15 - s2[1], s2[0], s2[2]]; });   // 剖面：晶粒更稀、换个排布
  var FACES = [[[1, 0, 0], [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]]], [[-1, 0, 0], [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]]],
    [[0, 1, 0], [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]]], [[0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]],
    [[0, 0, 1], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]], [[0, 0, -1], [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]]]];
  function hash3(a, b) { var h = Math.imul(a * 374761393 + b * 668265263, 1274126177); h ^= h >>> 13; return ((Math.imul(h, 1103515245) >>> 8) & 1023) / 1023; }
  function quadIdx(n) { var I = new Uint32Array(n * 6); for (var q = 0; q < n; q++) { var o = q * 6, v = q * 4; I[o] = v; I[o + 1] = v + 1; I[o + 2] = v + 2; I[o + 3] = v; I[o + 4] = v + 2; I[o + 5] = v + 3; } return I; }
  function mkVao(prg, layout, data, dyn) {
    var v = gl.createVertexArray(); gl.bindVertexArray(v);
    var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, dyn ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
    var st = 0, o = 0, k; for (k = 0; k < layout.length; k++) st += layout[k][1] * 4;
    for (k = 0; k < layout.length; k++) { var loc = gl.getAttribLocation(prg.p, layout[k][0]); if (loc >= 0) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, layout[k][1], gl.FLOAT, false, st, o); } o += layout[k][1] * 4; }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, IDX);
    gl.bindVertexArray(null);
    return { v: v, b: b, n: 0 };
  }
  var L1 = [['a_p', 3], ['a_n', 3], ['a_t', 2], ['a_c', 4]], L2 = [['a_p', 3], ['a_n', 3], ['a_g', 3]], L3 = [['a_p', 3], ['a_s', 1], ['a_c', 4]], L4 = [['a_p', 3], ['a_u', 2], ['a_k', 2]];
  function staticMesh(V) { var m = mkVao(P1, L1, new Float32Array(V)); m.n = V.length / 48 * 6; return m; }
  function freeMesh(m) { if (m) { gl.deleteVertexArray(m.v); gl.deleteBuffer(m.b); } }
  function box(V, x0, y0, z0, x1, y1, z1, col, flag) { for (var f = 0; f < 6; f++) { var n = FACES[f][0], cs = FACES[f][1]; for (var k = 0; k < 4; k++) { var c = cs[k]; V.push(c[0] ? x1 : x0, c[1] ? y1 : y0, c[2] ? z1 : z0, n[0], n[1], n[2], 0, 0, col[0], col[1], col[2], flag); } } }
  function tbox(V, x0, y0, z0, x1, y1, z1, tile, topTile) { for (var f = 0; f < 6; f++) { var n = FACES[f][0], cs = FACES[f][1], tl = n[1] > 0 ? topTile : tile; for (var k = 0; k < 4; k++) { var c = cs[k]; V.push(c[0] ? x1 : x0, c[1] ? y1 : y0, c[2] ? z1 : z0, n[0], n[1], n[2], (tl + ((k === 1 || k === 2) ? 1 : 0)) / NT, k >= 2 ? 0 : 1, 1, 1, 1, 0); } } }
  function init() {
    IDX = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, IDX); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, quadIdx(16384 * 4), gl.STATIC_DRAW);
    P1 = prog(VS1, FS1); P2 = prog(VS2, FS2); P3 = prog(VS3, FS3); P4 = prog(VS4, FS4); P5 = prog(VS5, FS5); P6 = prog(VS6, FS6); P7 = prog(VS5, FS7); SKYT = null; BEAM = mkVao(P6, [['a_p', 3], ['a_u', 2]], new Float32Array(5 * 4 * 2 * 8), true);
    gl.activeTexture(gl.TEXTURE0); ATX = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, ATX);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.activeTexture(gl.TEXTURE1); LTX = gl.createTexture(); gl.bindTexture(gl.TEXTURE_3D, LTX);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R].forEach(function (w) { gl.texParameteri(gl.TEXTURE_3D, w, gl.CLAMP_TO_EDGE); });
    gl.activeTexture(gl.TEXTURE0);
    // 玩家：方块小人（原创配色：棕发、肤色、青上衣、蓝裤、灰鞋），模型面朝 +x、左手（-z）持火把；比例 头8:身12:腿12。
    // 分成 身体 / 左臂（含火把）/ 右臂 / 左腿 / 右腿 五个网格，四肢绕肩、胯摆动（见 PJ 关节表）
    var V = [], U = 0.055, SK = [.85, .63, .47], HR = [.32, .2, .11], SH = [.18, .66, .64], SH2 = [.14, .52, .5], PA = [.24, .3, .7], PA2 = [.21, .27, .64], SO = [.45, .45, .47];
    box(V, -.11, 12 * U, -.22, .11, 24 * U, .22, SH, 2);                                                             // 身
    PLY = staticMesh(V); V = [];   // 头单独一个网格：绕脖子转头（看向奇怪的矿石）
    var hy = 24 * U; HEAD_Y = hy;
    box(V, -.22, hy, -.22, .22, hy + .44, .22, SK, 2);                                                              // 头
    box(V, -.235, hy + .34, -.235, .235, hy + .455, .235, HR, 2);                                                  // 头发：顶
    box(V, -.235, hy + .1, -.235, -.12, hy + .455, .235, HR, 2);                                                   // 后脑
    box(V, -.12, hy + .26, -.235, .1, hy + .455, -.2, HR, 2); box(V, -.12, hy + .26, .2, .1, hy + .455, .235, HR, 2);   // 两鬓
    box(V, .22, hy + .17, -.15, .228, hy + .23, -.04, [1, 1, 1], 2); box(V, .22, hy + .17, .04, .228, hy + .23, .15, [1, 1, 1], 2);   // 眼白
    box(V, .222, hy + .17, -.1, .232, hy + .23, -.04, [.22, .3, .66], 2); box(V, .222, hy + .17, .04, .232, hy + .23, .1, [.22, .3, .66], 2);   // 瞳
    box(V, .22, hy + .07, -.08, .228, hy + .11, .08, [.55, .34, .22], 2);                                          // 嘴
    PLH = staticMesh(V);
    V = []; box(V, -.11, 18 * U, -.44, .11, 24 * U, -.22, SH2, 2); box(V, -.11, 13 * U, -.44, .11, 18 * U, -.22, SK, 2);   // 左臂（袖 + 手）
    PLA = staticMesh(V); V = [];
    // 火把（握在左手里，木棍 + 三层火焰，火焰不受光照、自带亮色）；单独一个网格：用掉以后不再画
    box(V, .08, 13 * U, -.37, .16, 25 * U, -.29, [.46, .31, .18], 2); box(V, .09, 13 * U, -.36, .11, 25 * U, -.3, [.56, .39, .23], 2);
    box(V, .055, 25 * U, -.395, .185, 26.6 * U, -.265, [1, .5, .12], 3);
    box(V, .07, 26.6 * U, -.38, .17, 28 * U, -.28, [1, .78, .25], 3);
    box(V, .095, 28 * U, -.355, .145, 28.9 * U, -.305, [1, .97, .75], 3);
    PLT = staticMesh(V);
    V = []; box(V, .08, 13 * U, -.37, .16, 25 * U, -.29, [.46, .31, .18], 2); box(V, .075, 25 * U, -.375, .165, 26 * U, -.285, [.17, .13, .11], 2); STK = staticMesh(V);   // 灭了的火把：木棍 + 烧黑的头（不发光）
    V = []; box(V, -.11, 18 * U, .22, .11, 24 * U, .44, SH2, 2); box(V, -.11, 13 * U, .22, .11, 18 * U, .44, SK, 2); PRA = staticMesh(V);   // 右臂
    // 钻石镐（原创体素）：握在右手里，木柄沿前方伸出，镐头竖在柄端，两端渐尖
    V = []; var DI = [.36, .9, .86], DD = [.16, .55, .55], WD = [.47, .32, .18];
    box(V, -.05, 13.4 * U, .305, .5, 14.4 * U, .355, WD, 2);
    box(V, .44, 14 * U - .2, .3, .52, 14 * U + .2, .36, DI, 2); box(V, .45, 14 * U - .29, .31, .51, 14 * U - .2, .35, DD, 2); box(V, .45, 14 * U + .2, .31, .51, 14 * U + .29, .35, DD, 2);
    box(V, .42, 14 * U - .06, .295, .54, 14 * U + .06, .365, DD, 2);
    PICK = staticMesh(V);
    V = []; box(V, -.11, 0, -.22, .11, .1, -.005, SO, 2); box(V, -.11, .1, -.22, .11, 12 * U, -.005, PA, 2); PLL = staticMesh(V);          // 左腿（含鞋）
    V = []; box(V, -.11, 0, .005, .11, .1, .22, SO, 2); box(V, -.11, .1, .005, .11, 12 * U, .22, PA2, 2); PRL = staticMesh(V);            // 右腿
    V = []; box(V, 0, 0, 0, 1, 1, 1, [1, 1, 1], 2); BOX = staticMesh(V);
    FLV = mkVao(P2, L2, fdat, true); FLW = mkVao(P2, L2, wdat, true); PV = mkVao(P3, L3, pdat, true); WV = mkVao(P4, L4, adat, true);
    quadVao = gl.createVertexArray(); gl.bindVertexArray(quadVao); var qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW); var ql = gl.getAttribLocation(P5.p, 'a_p'); gl.enableVertexAttribArray(ql); gl.vertexAttribPointer(ql, 2, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null);
    TER = null; TERkey = ''; TOR = null; TORkey = ''; lightKey = ''; bndKey = ''; FB = null; fbW = fbH = 0; lvol = null;
  }
  try { init(); } catch (e) { return null; }
  canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); R.lost = true; }, { signal: signal });
  canvas.addEventListener('webglcontextrestored', function () { try { init(); R.lost = false; R.restored = (R.restored || 0) + 1; } catch (e) { R.failed = true; } }, { signal: signal });

  /* ---- 地形网格：俯视模式 = 当前层（y ∈ [b, b+2]，深坑/竖井附近向下多看 4 格）；侧视模式 = 梯子列所在剖面 ---- */
  function buildTerrain(sc, lv, mode, lx) {
    var C = sc.C, M = sc.M, X = sc.X, Z = sc.Z, b = C.levelBase(sc.level), V = [], W = M.W, x, y, z, f, k;
    var near = new Uint8Array(X * Z);
    // near：俯视时要往下多画的格。深坑 / 竖井 / 梯子及其四周向下看 6 格（深坑能看到下层的地面），
    // 浅坑本格只需坑底（y = b − 1 那块的顶面）；不标的话坑底不出面，会透出背景色
    for (z = 0; z < Z; z++) for (x = 0; x < X; x++) { var t = lv.t[z * W + x]; if (lv.pit[z * W + x] === 2 || t === 4 || t === 3) for (var dz = -1; dz <= 1; dz++) for (var dx = -1; dx <= 1; dx++) { var nx = x + dx, nz = z + dz; if (nx >= 0 && nz >= 0 && nx < X && nz < Z) near[nz * X + nx] = 2; }
      else if (lv.pit[z * W + x] === 1 && !near[z * X + x]) near[z * X + x] = 1; }
    if (mode !== 'climb') TERnear = near;
    var side = mode === 'climb' ? (lv.t[lv.ladder.i + 1] === 0 ? 1 : -1) : 0, lz = lv.ladder.z;
    // 侧视时世界顶部以上（最上层竖井的上段一直到地面）没有体素：按实心岩石补齐，只留出竖井那一列，地面以上为空
    var last = sc.level + 1 >= M.levels.length, vsurf = last ? b + 9 : 1e9;
    var y0 = mode === 'climb' ? b - 2 : b - 6, y1 = mode === 'climb' ? (last ? vsurf - 1 : C.levelBase(sc.level + 1) + 4) : b + 2;
    var matAt = function (xx, yy, zz) { if (mode === 'climb' && last && xx === lx && zz === lz && yy > b && yy < vsurf) return M_AIR; if (yy < sc.Y) return sc.mat[(yy * Z + zz) * X + xx]; if (mode !== 'climb') return M_STONE; return yy >= vsurf || (xx === lx && zz === lz) ? M_AIR : M_STONE; };
    var solidAt = function (xx, yy, zz) { if (xx < 0 || zz < 0 || yy < 0 || xx >= X || zz >= Z) return true; return isSolidM(matAt(xx, yy, zz)); };
    var inSlice = function (xx, zz) { if (side === 0) return true; return (side > 0 ? xx >= lx : xx <= lx) && Math.abs(zz - lz) <= 7; };
    for (y = Math.max(0, y0); y <= y1; y++) for (z = 0; z < Z; z++) for (x = 0; x < X; x++) {
      if (!inSlice(x, z)) continue;
      if (mode !== 'climb' && y < b && (near[z * X + x] === 0 || (near[z * X + x] === 1 && y < b - 1))) continue;
      var m = matAt(x, y, z);
      if (!isSolidM(m)) continue;
      var lvl = Math.floor((y - 1) / C.LEVEL_G), lvo = M.levels[Math.max(0, Math.min(M.levels.length - 1, lvl))], ti = z * W + x;
      var surf = mode === 'climb' && last && y >= vsurf - 4 && y < vsurf;   // 最后一段竖井：地表下 3 格泥土 + 最上面一格草方块
      var wbits = lvo.weird && (y - 1) % C.LEVEL_G >= 1 ? lvo.weird[ti] : 0;
      var tile = m === M_COBBLE ? 8 : m === M_OBSID ? 9 : m === M_GSTONE ? 10 : (lvo.ore[ti] && ((y - 1) % C.LEVEL_G === 1 || (y - 1) % C.LEVEL_G === 2) ? ORE_TILE[lvo.ore[ti]] : 0);
      for (f = 0; f < 6; f++) {
        var n = FACES[f][0], cs = FACES[f][1], ax = x + n[0], ay = y + n[1], az = z + n[2];
        var capF = mode !== 'climb' && y === b + 2 && n[1] === 1;
        var secF = side !== 0 && n[0] === -side && x === lx && n[1] === 0;
        if (n[1] < 0) continue;
        if (!capF && !secF && solidAt(ax, ay, az)) continue;
        if (!capF && !secF && !inSlice(ax, az)) continue;
        var tl = capF ? 14 : n[1] > 0 ? (y === b || (y - 1) % C.LEVEL_G === 0 ? (lvo.hall && lvo.hall[ti] && y === b ? 10 : 1) : 15) : tile;
        if (secF) tl = tile;
        if (wbits && mode !== 'climb') { var hb = (y - 1) % C.LEVEL_G; if (capF) tl = 24; else if (n[1] === 0 && ((hb === 1 && (wbits & 1)) || (hb === 2 && (wbits & 2)))) tl = 19; }   // 奇怪的矿石
        if (surf) tl = n[1] > 0 ? (y === vsurf - 1 ? 18 : 16) : (y === vsurf - 1 ? 17 : 16);
        for (k = 0; k < 4; k++) {
          var c = cs[k], ao = 1;
          if (!capF && !secF) {
            var ux = n[0] ? 0 : c[0] * 2 - 1, uy = n[1] ? 0 : c[1] * 2 - 1, uz = n[2] ? 0 : c[2] * 2 - 1, s1, s2;
            if (n[0]) { s1 = solidAt(ax, ay + uy, az); s2 = solidAt(ax, ay, az + uz); } else if (n[2]) { s1 = solidAt(ax, ay + uy, az); s2 = solidAt(ax + ux, ay, az); } else { s1 = solidAt(ax + ux, ay, az); s2 = solidAt(ax, ay, az + uz); }
            var s3 = solidAt(ax + ux, ay + uy, az + uz); ao = s1 && s2 ? 0.45 : 1 - (s1 + s2 + s3) * 0.16;
          }
          if (secF) ao = 0.62;
          V.push(x + c[0], y + c[1], z + c[2], n[0], n[1], n[2], (tl + ((k === 1 || k === 2) ? 1 : 0)) / NT, k >= 2 ? 0 : 1, ao, ao, ao, capF ? 1 : 0);
        }
      }
    }
    // 箱子、梯子（火把单独成网格，见 torchMesh）
    if (mode !== 'climb') for (var ii2 = 0; ii2 < lv.item.length; ii2++) {   // 遗落物品（装饰，贴地不挡路）：1 镐 2 铁轨 3 矿车 4 碎石堆 5 桶
      var it = lv.item[ii2]; if (!it) continue;
      var ix = ii2 % W, iz = (ii2 / W) | 0, fy = b + 1, o3 = hash3(ix, iz);
      if (it === 1) { box(V, ix + .25, fy, iz + .45, ix + .8, fy + .06, iz + .52, [.48, .32, .19], 2); box(V, ix + .7, fy, iz + .3, ix + .78, fy + .07, iz + .68, [.62, .64, .67], 2); }
      else if (it === 2) { for (var r3 = 0; r3 < 4; r3++) box(V, ix + .1 + r3 * .22, fy, iz + .2, ix + .2 + r3 * .22, fy + .04, iz + .8, [.42, .29, .17], 2); box(V, ix, fy + .04, iz + .3, ix + 1, fy + .08, iz + .36, [.55, .56, .6], 2); box(V, ix, fy + .04, iz + .64, ix + 1, fy + .08, iz + .7, [.55, .56, .6], 2); }
      else if (it === 3) { box(V, ix + .2, fy + .08, iz + .25, ix + .8, fy + .45, iz + .75, [.45, .46, .5], 2); box(V, ix + .25, fy + .4, iz + .3, ix + .75, fy + .46, iz + .7, [.25, .25, .28], 2); box(V, ix + .25, fy, iz + .2, ix + .35, fy + .1, iz + .3, [.2, .2, .22], 2); box(V, ix + .65, fy, iz + .7, ix + .75, fy + .1, iz + .8, [.2, .2, .22], 2); }
      else if (it === 4) { for (var r4 = 0; r4 < 4; r4++) { var ax = ix + .2 + hash3(ix + r4, iz) * .5, az = iz + .2 + hash3(iz + r4, ix) * .5, sz2 = .1 + r4 * .03; box(V, ax, fy, az, ax + sz2, fy + sz2, az + sz2, [.5, .5, .52], 2); } }
      else { box(V, ix + .38, fy, iz + .38, ix + .62, fy + .26, iz + .62, [.62, .64, .67], 2); box(V, ix + .41, fy + .2, iz + .41, ix + .59, fy + .27, iz + .59, [.3, .31, .34], 2); }
      void o3;
    }
    if (mode !== 'climb') lv.chests.forEach(function (ci) { var cx = ci % W, cz = (ci / W) | 0; tbox(V, cx + .1, b + 1, cz + .15, cx + .9, b + 1.75, cz + .85, 13, 11); });
    // 出口小厅南北墙上的告示牌（原创像素：木板 + 两道板缝 + 顶上两个挂钩 + 一圈不受光照的暗暖色描边，暗处也认得出）；贴在岩石墙面上，不占格
    if (mode !== 'climb' && lv.signs) lv.signs.forEach(function (sg) {
      var zf = sg.face > 0 ? sg.z + 1 : sg.z, d = sg.face * 0.07, z0 = Math.min(zf, zf + d), z1 = Math.max(zf, zf + d), x0 = sg.x + .12, x1 = sg.x + .88, ya = b + (sg.h || 1) + .2, yb = b + (sg.h || 1) + .72;
      box(V, x0 - .03, ya - .03, Math.min(zf, zf + d * 0.6), x1 + .03, yb + .03, Math.max(zf, zf + d * 0.6), [.36, .24, .13], 3);   // 描边（自发光、偏暗）
      box(V, x0, ya, z0, x1, yb, z1, [.72, .5, .28], 2);                                                                        // 木板
      for (var pl = 0; pl < 2; pl++) { var yy2 = ya + (pl + 1) * (yb - ya) / 3; box(V, x0 + .02, yy2 - .012, Math.min(zf + d, zf + d * 1.15), x1 - .02, yy2 + .012, Math.max(zf + d, zf + d * 1.15), [.5, .33, .18], 2); }   // 板缝
      [x0 + .1, x1 - .14].forEach(function (hx) { box(V, hx, yb, Math.min(zf, zf + d * 0.5), hx + .04, yb + .12, Math.max(zf, zf + d * 0.5), [.3, .3, .32], 2); });   // 挂钩
    });
    for (k = 0; k < M.levels.length; k++) {   // 梯子：贴在竖井靠墙一侧，从本层脚部到上层坑底（含水方块：流体可以与梯子同格）
      var lvk = M.levels[k], lxk = lvk.ladder.x, lzk = lvk.ladder.z, wallE = lvk.t[lvk.ladder.i + 1] === 0, bk = C.levelBase(k);
      var ytop = k + 1 < M.levels.length ? C.levelBase(k + 1) + 1 : bk + 9;
      if (mode !== 'climb' && k !== sc.level && k !== sc.level - 1) continue;
      if (!inSlice(lxk, lzk)) continue;
      var px = wallE ? lxk + 0.94 : lxk + 0.06, nxx = wallE ? -1 : 1;
      for (y = bk + 1; y < ytop; y++) {
        if (mode !== 'climb' && (y > b + 2 || y < b - 6)) continue;
        var u0 = 12 / NT, u1 = 13 / NT;
        V.push(px, y, lzk + (wallE ? 1 : 0), nxx, 0, 0, u0, 1, 1, 1, 1, 0, px, y, lzk + (wallE ? 0 : 1), nxx, 0, 0, u1, 1, 1, 1, 1, 0,
          px, y + 1, lzk + (wallE ? 0 : 1), nxx, 0, 0, u1, 0, 1, 1, 1, 0, px, y + 1, lzk + (wallE ? 1 : 0), nxx, 0, 0, u0, 0, 1, 1, 1, 0);
      }
    }
    return staticMesh(V);
  }
  function torchMesh(sc, mode, lx, lz, side) {
    var C = sc.C, X = sc.X, Z = sc.Z, V = [], x, z, k;
    for (z = 0; z < Z; z++) for (x = 0; x < X; x++) {
      if (side && ((side > 0 ? x < lx : x > lx) || Math.abs(z - lz) > 7)) continue;
      for (k = 0; k < sc.M.levels.length; k++) {
        if (mode !== 'climb' && k !== sc.level) continue;
        var bb = C.levelBase(k), ii = (bb + 1) * X * Z + z * X + x;
        if (sc.mat[ii] === M_TORCH) { var o2 = ((x + z) & 1) ? 0.22 : -0.22; box(V, x + .45 + o2, bb + 1, z + .45, x + .55 + o2, bb + 1.55, z + .55, [.48, .32, .19], 2); box(V, x + .42 + o2, bb + 1.55, z + .42, x + .58 + o2, bb + 1.72, z + .58, [1, .86, .38], 3); }
      }
    }
    return V.length ? staticMesh(V) : null;
  }
  /* ---- 光照体（CPU 泛洪，遮挡天然成立） ---- */
  var LT, LL, LH, LQ, lbuf;
  function lightAlloc(X, Z) { var n = X * Z * LY; LT = new Float32Array(n); LL = new Float32Array(n); LH = new Float32Array(n); LQ = new Int32Array(n); lbuf = new Uint8Array(n * 4); }
  function flood(sc, L, decay, lo) {
    var X = sc.X, Z = sc.Z, n = X * Z * LY, h = 0, tl = 0, i;
    for (i = 0; i < n; i++) if (L[i] > 0) LQ[tl++] = i;
    while (h < tl) {
      i = LQ[h++]; var v = L[i] - decay; if (v <= 0) continue;
      var x = i % X, z = ((i / X) | 0) % Z, y = (i / (X * Z)) | 0;
      for (var k = 0; k < 6; k++) {
        var nx = x + (k === 0) - (k === 1), ny = y + (k === 2) - (k === 3), nz = z + (k === 4) - (k === 5);
        if (nx < 0 || nz < 0 || ny < 0 || nx >= X || nz >= Z || ny >= LY) continue;
        var j = (ny * Z + nz) * X + nx;
        if (isSolidM(sc.mat[((ny + lo) * Z + nz) * X + nx]) || L[j] >= v) continue;
        L[j] = v; if (tl < LQ.length) LQ[tl++] = j;
      }
    }
    return tl;
  }
  // 实心格取相邻空格的最大值，供表面采样（线性插值时墙面不发黑）：边界表按地形版本缓存
  var BND = null, bndKey = '', TOUCH = null, nTouch = 0;
  function boundary(sc, lo) {
    var X = sc.X, Z = sc.Z, n = X * Z * LY, off = lo * X * Z, out = [], i, k;
    for (i = 0; i < n; i++) {
      if (!isSolidM(sc.mat[i + off])) continue;
      var x = i % X, z = ((i / X) | 0) % Z, y = (i / (X * Z)) | 0, start = out.length;
      out.push(i, 0);
      for (k = 0; k < 6; k++) {
        var nx = x + (k === 0) - (k === 1), ny = y + (k === 2) - (k === 3), nz = z + (k === 4) - (k === 5);
        if (nx < 0 || nz < 0 || ny < 0 || nx >= X || nz >= Z || ny >= LY) continue;
        var j = (ny * Z + nz) * X + nx; if (!isSolidM(sc.mat[j + off])) { out.push(j); out[start + 1]++; }
      }
      if (!out[start + 1]) out.length = start;
    }
    return new Int32Array(out);
  }
  function solidMax(L) { for (var p = 0; p < BND.length;) { var s = BND[p], c = BND[p + 1], m = 0; for (var k = 0; k < c; k++) { var v = L[BND[p + 2 + k]]; if (v > m) m = v; } L[s] = m; p += 2 + c; } }
  function lighting(sc, lv, st, lo, full, lavaUpd) {
    var X = sc.X, Z = sc.Z, n = X * Z * LY, i, W = sc.M.W, b = sc.C.levelBase(sc.level), off = lo * X * Z;
    if (!LT || LT.length !== n) { lightAlloc(X, Z); TOUCH = new Int32Array(n); nTouch = 0; full = true; lavaUpd = true; }
    var bk = lo + ':' + sc.solidVer + ':' + sc.level; if (bk !== bndKey) { BND = boundary(sc, lo); bndKey = bk; full = true; lavaUpd = true; }
    if (full) {   // 火把 / 小厅 / 信标（白光）
      LT.fill(0);
      for (i = 0; i < n; i++) if (sc.mat[i + off] === M_TORCH) LT[i] = 1;
      for (i = 0; i < lv.t.length; i++) if ((lv.t[i] === 2 || lv.t[i] === 3) && lv.grad[i] > 0.9) { var hy = b + 2 - lo; if (hy >= 0 && hy < LY) LT[(hy * Z + ((i / W) | 0)) * X + i % W] = 0.85; }
      if (st.beacons) for (var bq = 0; bq < st.beacons.length; bq++) { var by = b + 2 - lo, bcn = st.beacons[bq]; if (by >= 0 && by < LY) LT[(by * Z + bcn.z) * X + bcn.x] = 1; if (by - 1 >= 0) LT[((by - 1) * Z + bcn.z) * X + bcn.x] = 1; }
      flood(sc, LT, 1 / 7, lo); solidMax(LT);
      for (i = 0; i < n; i++) lbuf[i * 4] = LT[i] * 255;
    }
    if (lavaUpd) {   // 岩浆（暖光）+ 深坑预警
      LL.fill(0);
      if (sc.fluid === M_LAVA) for (i = 0; i < n; i++) if (sc.dm[i + off] === M_LAVA) { var v = sc.fq(i + off); if (v > 0) LL[i] = Math.min(1, 0.35 + v / 8 * 0.8); }
      if (st.warn) for (var k = 0; k < st.warn.length; k++) { var w = st.warn[k]; if (w.f === M_LAVA && w.p > 0) { var wy = b - lo; if (wy >= 0 && wy < LY) { var wi = (wy * Z + w.z) * X + w.x; LL[wi] = Math.max(LL[wi], 0.25 + 0.75 * w.p); } } }
      flood(sc, LL, 1 / 6, lo); solidMax(LL);
      for (i = 0; i < n; i++) lbuf[i * 4 + 1] = LL[i] * 255;
    }
    // 手持火把可见度：从玩家所在格泛洪（每帧，只动到被照到的格）
    for (i = 0; i < nTouch; i++) { LH[TOUCH[i]] = 0; lbuf[TOUCH[i] * 4 + 2] = 0; }
    nTouch = 0;
    var px = Math.floor(st.P.x), pz = Math.floor(st.P.z), py = Math.floor(st.P.y + 0.5) - lo;
    for (var yy = py; yy <= py + 1; yy++) if (yy >= 0 && yy < LY && px >= 0 && pz >= 0 && px < X && pz < Z) LH[(yy * Z + pz) * X + px] = 1;
    var tl = flood(sc, LH, 1 / 6, lo);
    for (i = 0; i < tl; i++) {
      var j = LQ[i]; TOUCH[nTouch++] = j;
      var x = j % X, z = ((j / X) | 0) % Z, y = (j / (X * Z)) | 0;
      for (k = 0; k < 6; k++) {
        var nx = x + (k === 0) - (k === 1), ny = y + (k === 2) - (k === 3), nz = z + (k === 4) - (k === 5);
        if (nx < 0 || nz < 0 || ny < 0 || nx >= X || nz >= Z || ny >= LY) continue;
        var s2 = (ny * Z + nz) * X + nx; if (isSolidM(sc.mat[s2 + off]) && LH[j] > LH[s2]) { if (!LH[s2]) TOUCH[nTouch++] = s2; LH[s2] = LH[j]; }
      }
    }
    for (i = 0; i < nTouch; i++) lbuf[TOUCH[i] * 4 + 2] = LH[TOUCH[i]] * 255;
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_3D, LTX);
    if (!lvol || lvolDims[0] !== X || lvolDims[1] !== Z) { gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, X, Z, LY, 0, gl.RGBA, gl.UNSIGNED_BYTE, lbuf); lvol = 1; lvolDims = [X, Z, LY]; }
    else gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, 0, X, Z, LY, gl.RGBA, gl.UNSIGNED_BYTE, lbuf);
    gl.activeTexture(gl.TEXTURE0);
  }
  /* ---- 液体网格（每帧，只在可见范围） ---- */
  function fluidMesh(sc, x0, x1, y0, y1, z0, z1, climb, lx, cutY, near, nearBelow) {   // near：低于 nearBelow 的流体只画深坑 / 竖井附近（其余被地面挡住）
    var X = sc.X, Z = sc.Z, XZ = X * Z, nl = 0, nw = 0, x, y, z;
    x0 = Math.max(0, x0); z0 = Math.max(0, z0); x1 = Math.min(X - 1, x1); z1 = Math.min(Z - 1, z1); y0 = Math.max(0, y0); y1 = Math.min(sc.Y - 2, y1);
    function lev(i) { var v = sc.fq(i); if (!v) return 0; return sc.fq(i + XZ) > 0 ? 1 : v / 8; }
    function q(arr, n, ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, nx, ny, nz, g1, g2) {
      if (n * 36 + 36 > arr.length) return n; var o = n * 36;
      arr[o] = ax; arr[o + 1] = ay; arr[o + 2] = az; arr[o + 9] = bx; arr[o + 10] = by; arr[o + 11] = bz; arr[o + 18] = cx; arr[o + 19] = cy; arr[o + 20] = cz; arr[o + 27] = dx; arr[o + 28] = dy; arr[o + 29] = dz;
      for (var k = 0; k < 4; k++) { var p = o + k * 9; arr[p + 3] = nx; arr[p + 4] = ny; arr[p + 5] = nz; arr[p + 6] = g1; arr[p + 7] = g2; arr[p + 8] = 0; }
      return n + 1;
    }
    for (y = y0; y <= y1; y++) for (z = z0; z <= z1; z++) for (x = x0; x <= x1; x++) {
      if (climb && (lx.side > 0 ? x < lx.x : x > lx.x)) continue;
      if (near && y < nearBelow && near[z * X + x] !== 2) continue;
      var i = (y * Z + z) * X + x, h = lev(i); if (!h) continue;
      var lava = sc.dm[i] === M_LAVA, arr = lava ? fdat : wdat, n = lava ? nl : nw, top = y + h, g1 = sc.surge[i] / 0.4;
      var g2 = 0;
      if (h < 1 || !sc.fq(i + XZ)) n = q(arr, n, x, top, z + 1, x + 1, top, z + 1, x + 1, top, z, x, top, z, 0, 1, 0, g1, g2);
      else if (cutY != null && y === cutY) { n = q(arr, n, x, top, z + 1, x + 1, top, z + 1, x + 1, top, z, x, top, z, 0, 1, 0, 0, 0); arr[n * 36 - 1] = arr[n * 36 - 10] = arr[n * 36 - 19] = arr[n * 36 - 28] = 1; }   // 剖切面：流体继续往上 → 盖一个剖面（a_g.z = 1）
      for (var f = 0; f < 4; f++) {
        var dxx = f === 0 ? 1 : f === 1 ? -1 : 0, dzz = f === 2 ? 1 : f === 3 ? -1 : 0, nx = x + dxx, nz = z + dzz;
        var sec = climb && nx === lx.x - lx.side && x === lx.x;
        if (!sec) { if (nx < 0 || nz < 0 || nx >= X || nz >= Z) continue; var j = (y * Z + nz) * X + nx; if (isSolidM(sc.mat[j])) continue; var hn = lev(j); if (hn >= h) continue; }
        var yb = y + (sec ? 0 : lev((y * Z + nz) * X + nx));
        if (f === 0) n = q(arr, n, x + 1, yb, z + 1, x + 1, yb, z, x + 1, top, z, x + 1, top, z + 1, 1, 0, 0, g1, g2);
        else if (f === 1) n = q(arr, n, x, yb, z, x, yb, z + 1, x, top, z + 1, x, top, z, -1, 0, 0, g1, g2);
        else if (f === 2) n = q(arr, n, x, yb, z + 1, x + 1, yb, z + 1, x + 1, top, z + 1, x, top, z + 1, 0, 0, 1, g1, g2);
        else n = q(arr, n, x + 1, yb, z, x, yb, z, x, top, z, x + 1, top, z, 0, 0, -1, g1, g2);
      }
      if (lava) nl = n; else nw = n;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, FLV.b); gl.bufferSubData(gl.ARRAY_BUFFER, 0, fdat, 0, nl * 36); FLV.n = nl * 6;
    gl.bindBuffer(gl.ARRAY_BUFFER, FLW.b); gl.bufferSubData(gl.ARRAY_BUFFER, 0, wdat, 0, nw * 36); FLW.n = nw * 6;
  }
  /* ---- 相机 ---- */
  function camera(cx, cy, cz, yaw, pitch, ppu, pl) {
    var W = canvas.width, H = canvas.height;
    var cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    var f = [-syw * cp, -sp, -cyw * cp], r = [cyw, 0, -syw]; CF = f; var u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    var hw = W / 2 / ppu, hh = H / 2 / ppu;
    var ex = cx * r[0] + cy * r[1] + cz * r[2], ey = cx * u[0] + cy * u[1] + cz * u[2], ez = cx * f[0] + cy * f[1] + cz * f[2];
    R.camF = [ex * ppu, ey * ppu];
    ex = Math.round(ex * ppu) / ppu; ey = Math.round(ey * ppu) / ppu;    // 视平面上按像素取整，避免 1px 抖动
    Vm.set([r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, -ex, -ey, ez - 40, 1]);
    Mp.set([1 / hw, 0, 0, 0, 0, 1 / hh, 0, 0, 0, 0, -2 / 80, 0, 0, 0, -1, 1]);
    R.cam = [Math.round(ex * ppu), Math.round(ey * ppu)];
    cpV[0] = pl[0] * r[0] + pl[1] * r[1] + pl[2] * r[2] - ex; cpV[1] = pl[0] * u[0] + pl[1] * u[1] + pl[2] * u[2] - ey; cpV[2] = -(pl[0] * f[0] + pl[1] * f[1] + pl[2] * f[2]) + ez - 40;
    R.pl = [cpV[0] * ppu, cpV[1] * ppu];
    VIEW = function (x, y, z) { return [x * r[0] + y * r[1] + z * r[2] - ex, x * u[0] + y * u[1] + z * u[2] - ey, -(x * f[0] + y * f[1] + z * f[2]) + ez - 40]; };
    R.projY = function (x, y, z) { return H / 2 - ((x * u[0] + y * u[1] + z * u[2]) - ey) * ppu; };   // 世界点在画布上的 y（像素）
    R.proj = function (x, y, z) { var v = VIEW(x, y, z); return [W / 2 + v[0] * ppu, H / 2 - v[1] * ppu]; };   // 世界点在画布上的位置（测试用）
  }
  function pitWin(st, b) {   // 深坑观察窗的两端（视空间）：坑口中心 → 下层地面中心
    var d = st.deep; if (!d || !(d.on > 0.01) || !VIEW) { gl.uniform4f(P1.u.pa, 0, 0, 0, 0); return; }
    var A = VIEW(d.x + 0.5, b + 1, d.z + 0.5), B = VIEW(d.x + 0.5, b - 5, d.z + 0.5);
    gl.uniform4f(P1.u.pa, A[0], A[1], A[2], d.on); gl.uniform4f(P1.u.pb, B[0], B[1], B[2], 0);
  }
  function common(Pg, st, lo) {
    var u = Pg.u, th = st.theme;
    gl.uniformMatrix4fv(u.Pm, false, Mp); gl.uniformMatrix4fv(u.Vm, false, Vm);
    if (u.L) {
      gl.uniform1i(u.L, 1); gl.uniform3f(u.lo, 0, lo, 0); gl.uniform3f(u.dims, lvolDims[0], lvolDims[1], lvolDims[2]);
      var am = st.mode === 'climb' ? 2.4 : 1; gl.uniform3f(u.pp, st.P.x, st.P.y, st.P.z); gl.uniform3f(u.amb, th.amb[0] * am, th.amb[1] * am, th.amb[2] * am); gl.uniform3f(u.shc, th.shc[0], th.shc[1], th.shc[2]);
      gl.uniform1f(u.hr, st.P.torch === false ? 1.3 : 4.6 + (st.rm ? 0 : Math.sin(st.time * 9) * 0.1 + Math.sin(st.time * 23) * 0.06));   // 火把用掉以后：只剩身边一点微光 gl.uniform1f(u.tm, st.rm ? 0 : st.time);
      gl.uniform1f(u.heatK, st.heat ? 0.9 : 0); gl.uniform1f(u.dfl, st.mode === 'climb' ? -1e4 : sc0.C.levelBase(sc0.level) + 0.98);
    }
    if (u.cp) { gl.uniform4f(u.cp, cpV[0], cpV[1], cpV[2], 0); gl.uniform1f(u.cutY, st.cutY); gl.uniform1f(u.cutOn, 0); gl.uniform3f(u.cf, CF[0], CF[1], CF[2]); gl.uniform1f(u.fpass, 0); }
  }
  function drawObj(m, x, y, z, rot, sx) {
    gl.uniform3f(P1.u.off, x, y, z); gl.uniform1f(P1.u.rot, rot); gl.uniform4f(P1.u.lp, 0, 0, 0, 0); gl.uniform4f(P1.u.tl, 0, 0, 0, 0);
    gl.bindVertexArray(m.v); gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_INT, 0);
  }
  // 人物：身体 + 四肢（MC 式摆动：左臂与右腿同相，右臂与左腿同相；持火把的左臂摆幅只有 0.3，火把稳定）
  var SH_Y = 24 * 0.055 - 0.05, HIP_Y = 12 * 0.055;
  function drawPlayer(P, y) {
    var sw = P.sw || 0, a = Math.sin(P.ph || 0), rch = P.reach || 0, la, ra, ll, rl, T = P.tl || ZT;
    // 角度符号：人物朝 +x，lp.w = −角度，所以负角度 = 手臂向前（朝面向的方向）抬起。爬梯、爬出矿坑、扒深坑沿时双臂都朝前上方伸向梯子 / 坑沿
    if (P.climb) { la = -2.5 + 0.35 * a * sw; ra = -2.5 - 0.35 * a * sw; ll = 0.45 - 0.35 * a * sw; rl = 0.45 + 0.35 * a * sw; }
    else { var A = 0.62 * sw * a; ll = -A; rl = A; la = A * 0.3; ra = -A * 0.85; var rta = -2.3 + 1.3 * (P.press || 0); la += (rta - la) * rch; ra += (rta - ra) * rch; }   // press：撑出坑沿时双臂改为向前下方（约 −1.0 rad）按住坑沿
    if (P.pick > 0) { var swg = P.swing || 0; ra += (-1.75 - 0.75 * Math.cos(swg) - ra) * Math.min(1, P.pick * 1.4); }   // 挖矿：右臂举镐往下砸
    if (P.arms) { la = P.arms[0]; ra = P.arms[1]; } if (P.legs) { ll = P.legs[0]; rl = P.legs[1]; }   // 倒下 / 爬 / 用火把取暖时的姿势由游戏给出
    gl.uniform4f(P1.u.tl, T[0], T[1], T[2], 0);
    gl.uniform3f(P1.u.off, P.x, y, P.z); gl.uniform1f(P1.u.rot, P.rot); gl.uniform4f(P1.u.lp, 0, 0, 0, 0); gl.bindVertexArray(PLY.v); gl.drawElements(gl.TRIANGLES, PLY.n, gl.UNSIGNED_INT, 0);
    gl.uniform3f(P1.u.off, P.x, y, P.z); gl.uniform1f(P1.u.rot, P.rot + (T[0] || T[1] ? 0 : P.hyaw || 0)); gl.uniform4f(P1.u.lp, 0, HEAD_Y, 0, -(P.hpitch || 0)); gl.bindVertexArray(PLH.v); gl.drawElements(gl.TRIANGLES, PLH.n, gl.UNSIGNED_INT, 0);
    var parts = [[PLA, SH_Y, la], [PRA, SH_Y, ra], [PLL, HIP_Y, ll], [PRL, HIP_Y, rl]];
    parts.push([P.torch !== false ? PLT : STK, SH_Y, la]);
    if (P.pick > 0.05) parts.push([PICK, SH_Y, ra]);
    for (var i = 0; i < parts.length; i++) { gl.uniform3f(P1.u.off, P.x, y, P.z); gl.uniform1f(P1.u.rot, P.rot); gl.uniform4f(P1.u.lp, 0, parts[i][1], 0, -parts[i][2]); gl.bindVertexArray(parts[i][0].v); gl.drawElements(gl.TRIANGLES, parts[i][0].n, gl.UNSIGNED_INT, 0); }
    gl.uniform4f(P1.u.lp, 0, 0, 0, 0); gl.uniform4f(P1.u.tl, 0, 0, 0, 0);
  }
  var ZT = [0, 0, 0];
  function fbo(w, h) {
    if (FB && fbW === w && fbH === h) return;
    if (FB) { gl.deleteFramebuffer(FB); gl.deleteTexture(FBT); gl.deleteRenderbuffer(FBD); }
    FB = gl.createFramebuffer(); FBT = gl.createTexture(); FBD = gl.createRenderbuffer();
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, FBT); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindRenderbuffer(gl.RENDERBUFFER, FBD); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, FB); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, FBT, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, FBD);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.activeTexture(gl.TEXTURE0); fbW = w; fbH = h;
  }
  /* ---- 一帧 ----
   * st: {sc, lv, P:{x,y,z,rot,bob}, cam:{x,y,z}, time, rm, theme, mode:'top'|'climb', beacon, parts:Float32Array(n*8), np, warn:[{x,z,p,f}], cutY, heat} */
  R.draw = function (st) {
    if (R.lost) return;
    var sc = st.sc, lv = st.lv, C = sc.C, b = C.levelBase(sc.level), climb = st.mode === 'climb';
    var lo = climb ? Math.max(0, Math.floor(st.P.y) - 3) : b - 6; sc0 = sc;   // 俯视：光照体从下层地面（b − 6）起，深坑里与下层也有光照
    var lx = { x: lv.ladder.x, side: lv.t[lv.ladder.i + 1] === 0 ? 1 : -1 };
    var key = sc.level + ':' + st.mode + ':' + sc.solidVer;
    if (key !== TERkey) { freeMesh(TER); TER = buildTerrain(sc, lv, st.mode, lx.x); TERkey = key; lightKey = ''; }
    var tkey = key + ':' + sc.torchVer; if (tkey !== TORkey) { freeMesh(TOR); TOR = torchMesh(sc, st.mode, lx.x, lv.ladder.z, climb ? lx.side : 0); TORkey = tkey; }
    var lk = sc.level + ':' + lo + ':' + sc.solidVer + ':' + sc.torchVer + ':' + (st.beacons ? st.beacons.length : 0), full = lk !== lightKey;
    var lavaUpd = full || st.time - lastLight > 0.2 || st.time < lastLight;
    if (full) lightKey = lk; if (lavaUpd) lastLight = st.time;
    lighting(sc, lv, st, lo, full, lavaUpd);
    var cw = canvas.width, ch = canvas.height, ppu = Math.round(Math.max(10, Math.min(64, ch / 10.5)));
    var yaw = climb ? (lx.side > 0 ? -Math.PI / 2 : Math.PI / 2) : 0.5, pitch = climb ? 0.14 : 0.86;
    if (climb) ppu = Math.round(Math.max(10, Math.min(72, ch / 8)));
    if (R.zoom) ppu = Math.round(ppu * R.zoom);
    camera(st.cam.x, st.cam.y, st.cam.z, yaw, pitch, ppu, [st.P.x, st.P.y + 1, st.P.z]);
    var post = st.heat && !climb;
    if (post) { fbo(cw, ch); gl.bindFramebuffer(gl.FRAMEBUFFER, FB); } else gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, cw, ch);
    var bg = st.theme.bg; gl.clearColor(bg[0], bg[1], bg[2], 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (st.sky) {   // 最后一段竖井：先铺天空远景（调用方按地表在画布上的高度画好 320×240 的图），地形画在它前面
      var skc = st.sky(R.projY);
      gl.activeTexture(gl.TEXTURE4); if (!SKYT) { SKYT = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, SKYT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); }
      gl.bindTexture(gl.TEXTURE_2D, SKYT); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, skc);
      gl.useProgram(P7.p); gl.uniform1i(P7.u.S, 4); gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.bindVertexArray(quadVao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.bindVertexArray(null); gl.depthMask(true); gl.activeTexture(gl.TEXTURE0);
    }
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.enable(gl.CULL_FACE); gl.disable(gl.BLEND); gl.depthMask(true);
    gl.useProgram(P1.p); common(P1, st, lo); gl.uniform1i(P1.u.A, 0); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, ATX);
    gl.uniform3fv(P1.u.cap, st.theme.cap); gl.uniform4f(P1.u.tint, 0, 0, 0, 0); gl.uniform4f(P1.u.ptint, 0, 0, 0, 0); gl.uniform4f(P1.u.tl, 0, 0, 0, 0);
    gl.disable(gl.CULL_FACE);   // 梯子等单面片
    var pitOn = !climb && st.deep && st.deep.on > 0.01, fadeOn = !climb && ((st.P.occ || 0) > 0.002 || pitOn);
    pitWin(st, b); gl.uniform1f(P1.u.fpass, fadeOn ? 1 : 0); gl.uniform1f(P1.u.cutOn, fadeOn ? st.P.occ : 0);
    drawObj(TER, 0, 0, 0, 0);
    gl.uniform1f(P1.u.fpass, 0);
    if (TOR) drawObj(TOR, 0, 0, 0, 0);
    // 挖奇怪的矿石时的裂纹（4 个阶段）：贴在被挖那一面外侧一点
    var mn = st.mine;
    if (mn && mn.stage > 0 && !climb) {
      var ck = mn.x + ',' + mn.y + ',' + mn.z + ',' + mn.fx + ',' + mn.fz + ',' + mn.stage;
      if (ck !== CRKkey) { freeMesh(CRK); CRKkey = ck; var CV = [], tl2 = 19 + mn.stage;
        for (var f2 = 0; f2 < 6; f2++) { var n2 = FACES[f2][0]; if (n2[0] !== mn.fx || n2[2] !== mn.fz || n2[1] !== 0) continue;
          for (var k2 = 0; k2 < 4; k2++) { var c2 = FACES[f2][1][k2]; CV.push(mn.x + c2[0] + n2[0] * 0.004, mn.y + c2[1], mn.z + c2[2] + n2[2] * 0.004, n2[0], 0, n2[2], (tl2 + ((k2 === 1 || k2 === 2) ? 1 : 0)) / NT, k2 >= 2 ? 0 : 1, 1, 1, 1, 0); } }
        CRK = staticMesh(CV); }
      drawObj(CRK, 0, 0, 0, 0);
    }
    gl.enable(gl.CULL_FACE);
    gl.uniform1f(P1.u.cutOn, 0);
    if (st.beacons && !climb) for (var bq2 = 0; bq2 < st.beacons.length; bq2++) {   // 信标（原创造型）：黑曜石底座 + 四角玻璃柱 + 发光青色核心 + 玻璃顶
      var bx = st.beacons[bq2].x, bz = st.beacons[bq2].z;
      drawObjScaled(bx + .04, b + 1, bz + .04, .92, .22, .92, [.11, .08, .16], 2);
      drawObjScaled(bx + .22, b + 1.22, bz + .22, .56, .5, .56, [.5, 1, .96], 3);
      for (var cq = 0; cq < 4; cq++) drawObjScaled(bx + .06 + (cq & 1) * .76, b + 1.22, bz + .06 + (cq >> 1) * .76, .12, .56, .12, [.74, .9, .94], 2);
      drawObjScaled(bx + .04, b + 1.78, bz + .04, .92, .12, .92, [.74, .9, .94], 2);
    }
    var bob = st.P.bob || 0;
    // 液体
    var k;
    var vr = Math.ceil(cw / ppu / 2) + 3, vz = Math.ceil(ch / ppu / 2) + 6;
    if (climb) fluidMesh(sc, lx.x - 1, lx.x + 1, Math.floor(st.cam.y) - 7, Math.floor(st.cam.y) + 7, lv.ladder.z - 6, lv.ladder.z + 6, true, lx);
    else fluidMesh(sc, Math.floor(st.cam.x) - vr - 2, Math.floor(st.cam.x) + vr + 2, b - 5, b + 2, Math.floor(st.cam.z) - vz, Math.floor(st.cam.z) + vz, false, lx, b + 2, TERnear, b - 1);
    gl.useProgram(P2.p); common(P2, st, lo); gl.disable(gl.CULL_FACE);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    if (FLV.n && !climb) { gl.uniform1f(P2.u.lava, 1); gl.uniform1f(P2.u.alphaL, 1); gl.bindVertexArray(FLV.v); gl.drawElements(gl.TRIANGLES, FLV.n, gl.UNSIGNED_INT, 0); }
    // 玩家：先画“被挡住部分”的轮廓（只与已画的地形 / 岩浆比深度，不会与自己比），再正常画
    gl.useProgram(P1.p); gl.enable(gl.CULL_FACE); gl.enable(gl.BLEND); gl.uniform1f(P1.u.cutOn, 0);
    var tnt = st.P.inLava ? [1, .3, .1, .5] : [.92, .96, 1, .5];
    gl.depthFunc(gl.GREATER); gl.depthMask(false); gl.uniform4f(P1.u.tint, tnt[0], tnt[1], tnt[2], tnt[3]);
    drawPlayer(st.P, st.P.y + bob);
    gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.BLEND); gl.uniform4f(P1.u.tint, 0, 0, 0, 0);
    var pt = st.P.ptint; if (pt) gl.uniform4f(P1.u.ptint, pt[0], pt[1], pt[2], pt[3]);
    drawPlayer(st.P, st.P.y + bob); gl.uniform4f(P1.u.ptint, 0, 0, 0, 0);
    gl.useProgram(P2.p); gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND);
    if (FLV.n && climb) { gl.uniform1f(P2.u.lava, 1); gl.depthMask(false); gl.uniform1f(P2.u.alphaL, 0.8); gl.bindVertexArray(FLV.v); gl.drawElements(gl.TRIANGLES, FLV.n, gl.UNSIGNED_INT, 0); gl.depthMask(true); }
    if (FLW.n) { gl.depthMask(false); gl.uniform1f(P2.u.lava, 0); gl.bindVertexArray(FLW.v); gl.drawElements(gl.TRIANGLES, FLW.n, gl.UNSIGNED_INT, 0); gl.depthMask(true); }
    // 深坑 / 竖井预警：坑口的辉光（岩浆）或涟漪（水）；被前墙挡住时再以半透明“透视”画一遍
    var nw = 0;
    if (st.warn) for (k = 0; k < st.warn.length && nw < 60; k++) {
      var w = st.warn[k]; if (w.p <= 0) continue;
      var o = nw * 28, yy = b + 1.03, kind = w.f === M_LAVA ? 0 : 1;
      var a0 = -0.7, a1 = 1.7; adat.set([w.x + a0, yy, w.z + a0, 0, 0, w.p, kind, w.x + a1, yy, w.z + a0, 1, 0, w.p, kind, w.x + a1, yy, w.z + a1, 1, 1, w.p, kind, w.x + a0, yy, w.z + a1, 0, 1, w.p, kind], o);
      nw++;
    }
    if (nw) {
      gl.useProgram(P4.p); gl.uniformMatrix4fv(P4.u.Pm, false, Mp); gl.uniformMatrix4fv(P4.u.Vm, false, Vm); gl.uniform1f(P4.u.tm, st.rm ? 0 : st.time);
      gl.bindVertexArray(WV.v); gl.bindBuffer(gl.ARRAY_BUFFER, WV.b); gl.bufferSubData(gl.ARRAY_BUFFER, 0, adat, 0, nw * 28);
      gl.depthMask(false);
      gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE);
      var water = st.warn[0].f !== M_LAVA;
      if (water) gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
      gl.uniform1f(P4.u.ghost, 1); gl.depthFunc(gl.LEQUAL); gl.drawElements(gl.TRIANGLES, nw * 6, gl.UNSIGNED_INT, 0);
      gl.uniform1f(P4.u.ghost, 0.55); gl.depthFunc(gl.GREATER); gl.drawElements(gl.TRIANGLES, nw * 6, gl.UNSIGNED_INT, 0);
      gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    }
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    // 粒子（气流 / 火星 / 水汽 / 滴水 / 混合蒸汽）
    if (st.np) {
      gl.useProgram(P3.p); gl.uniformMatrix4fv(P3.u.Pm, false, Mp); gl.uniformMatrix4fv(P3.u.Vm, false, Vm); gl.uniform1f(P3.u.ps, Math.max(1, ppu / 14));
      gl.bindVertexArray(PV.v); gl.bindBuffer(gl.ARRAY_BUFFER, PV.b); gl.bufferSubData(gl.ARRAY_BUFFER, 0, st.parts, 0, st.np * 8);
      gl.depthMask(false); gl.drawArrays(gl.POINTS, 0, st.np); gl.depthMask(true);
    }
    if (fadeOn) {   // 遮挡墙的半透明遍：不透明物体都画完之后再画，只写颜色不写深度，背面剔除（见着色器）
      gl.useProgram(P1.p); common(P1, st, lo); gl.uniform1i(P1.u.A, 0); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, ATX);
      gl.uniform3fv(P1.u.cap, st.theme.cap); gl.uniform4f(P1.u.tint, 0, 0, 0, 0); gl.uniform1f(P1.u.fpass, 2); gl.uniform1f(P1.u.cutOn, st.P.occ); pitWin(st, b);
      gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE); gl.depthMask(false); gl.disable(gl.CULL_FACE);
      drawObj(TER, 0, 0, 0, 0);
      gl.depthMask(true); gl.uniform1f(P1.u.fpass, 0);
    }
    if (st.beacons && st.beacons.length && !climb) {
      var bd = new Float32Array(st.beacons.length * 2 * 4 * 5), nb = 0, HB = 34, wB = .22;
      for (var bq3 = 0; bq3 < st.beacons.length && bq3 < 4; bq3++) { var cx2 = st.beacons[bq3].x + .5, cz2 = st.beacons[bq3].z + .5, y0b = b + 1.8;
        bd.set([cx2 - wB, y0b, cz2, 0, 0, cx2 + wB, y0b, cz2, 1, 0, cx2 + wB, y0b + HB, cz2, 1, HB, cx2 - wB, y0b + HB, cz2, 0, HB,
          cx2, y0b, cz2 - wB, 0, 0, cx2, y0b, cz2 + wB, 1, 0, cx2, y0b + HB, cz2 + wB, 1, HB, cx2, y0b + HB, cz2 - wB, 0, HB], nb * 40); nb++; }
      gl.useProgram(P6.p); gl.uniformMatrix4fv(P6.u.Pm, false, Mp); gl.uniformMatrix4fv(P6.u.Vm, false, Vm); gl.uniform1f(P6.u.tm, st.rm ? 0 : st.time); gl.uniform1f(P6.u.rmo, st.rm ? 1 : 0);
      gl.bindVertexArray(BEAM.v); gl.bindBuffer(gl.ARRAY_BUFFER, BEAM.b); gl.bufferSubData(gl.ARRAY_BUFFER, 0, bd, 0, nb * 40);
      gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE); gl.depthMask(false); gl.disable(gl.CULL_FACE);
      gl.drawElements(gl.TRIANGLES, nb * 12, gl.UNSIGNED_INT, 0); gl.depthMask(true);
    }
    gl.disable(gl.BLEND); gl.bindVertexArray(null);
    if (post) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, cw, ch); gl.disable(gl.DEPTH_TEST);
      gl.useProgram(P5.p); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, FBT); gl.uniform1i(P5.u.S, 2);
      gl.uniform2f(P5.u.res, cw, ch); gl.uniform1f(P5.u.tm, st.time); var shp = R.pl ? [0.5 + R.pl[0] / cw, 0.5 + R.pl[1] / ch] : [0.5, 0.5]; gl.uniform3f(P5.u.sh, shp[0], shp[1], st.shim || 0); gl.bindVertexArray(quadVao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null); gl.activeTexture(gl.TEXTURE0); gl.enable(gl.DEPTH_TEST);
    }
    R.ppu = ppu;
  };
  function drawObjScaled(x, y, z, sx, sy, sz, col, flag) {
    // BOX 是单位立方体；这里用顶点着色器的 off 平移 + 逐次缩放的近似：直接临时建网格太贵，改为预建几种尺寸
    var key = sx + ',' + sy + ',' + sz + ',' + col.join(',') + ',' + flag, m = SCALED[key];
    if (!m) { var V = []; box(V, 0, 0, 0, sx, sy, sz, col, flag); m = SCALED[key] = staticMesh(V); }
    drawObj(m, x, y, z, 0);
  }
  var SCALED = {};
  canvas.addEventListener('webglcontextrestored', function () { SCALED = {}; }, { signal: signal });
  R.loseForTest = function () { var e = gl.getExtension('WEBGL_lose_context'); if (e) { e.loseContext(); setTimeout(function () { e.restoreContext(); }, 200); } return !!e; };
  R.renderer = function () { var e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); };
  return R;
}
