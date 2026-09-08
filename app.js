import * as THREE from "three";
const LEVELS={furniture:["connected-l","sofa-chairs","sofa-beanbag","four-armchairs"],lighting:["bright-overhead","localized-lamps","pendant-cluster","dramatic"],wall:["neutral","warm","dark","brick"],decor:["none","botanical","artistic","eclectic"]};
let current={furniture:"connected-l",lighting:"bright-overhead",wall:"neutral",decor:"none"},mode="compare",k=2,replacementFeature="furniture",candidates=[],turn=1,events=[],ended=false;
const cp=x=>({...x}),key=x=>Object.values(x).join("|");
function random(ex=[]){let ban=new Set(ex.map(key));for(;;){let x={};for(const f in LEVELS)x[f]=LEVELS[f][Math.floor(Math.random()*4)];if(!ban.has(key(x)))return x}}
function gen(){candidates=[];if(mode==="compare"){while(candidates.length<k)candidates.push(random([current,...candidates]))}else if(mode==="replace")candidates=LEVELS[replacementFeature].filter(v=>v!==current[replacementFeature]).map(v=>({...current,[replacementFeature]:v}))}
function randomNextMode(){
  const modes=["compare","eval","replace"];
  mode=modes[Math.floor(Math.random()*modes.length)];
  if(mode==="compare") k=Math.max(1,Math.min(4,k));
  gen();
}
function advance(action, selected=null, updateCurrent=false){
  log(action, selected);
  if(updateCurrent && selected) current=cp(selected);
  turn++;
  randomNextMode();
  draw();
}
function log(action,selected=null){events.push({turn,mode,k:mode==="compare"?k:null,feature:mode==="replace"?replacementFeature:null,current:cp(current),candidates:candidates.map(cp),action,selected:selected&&cp(selected)});document.querySelector("#log").textContent=JSON.stringify(events,null,2)}
class Room{constructor(el){this.el=el;this.s=new THREE.Scene();this.s.background=new THREE.Color(0xe7e3dc);this.cam=new THREE.PerspectiveCamera(43,1,.1,100);this.cam.position.set(0,3.8,12.8);this.cam.lookAt(0,2.15,-.5);this.r=new THREE.WebGLRenderer({antialias:true});this.r.outputColorSpace=THREE.SRGBColorSpace;this.r.toneMapping=THREE.ACESFilmicToneMapping;el.appendChild(this.r.domElement);this.wall=new THREE.MeshStandardMaterial({color:0xeee8df,roughness:.9});this.wood=new THREE.MeshStandardMaterial({color:0x704b32,roughness:.8});this.fabric=new THREE.MeshStandardMaterial({color:0xb4aa9d,roughness:1});this.fabric2=new THREE.MeshStandardMaterial({color:0x88796d,roughness:1});this.white=new THREE.MeshStandardMaterial({color:0xf2efe9});this.dark=new THREE.MeshStandardMaterial({color:0x343637});this.green=new THREE.MeshStandardMaterial({color:0x426847});this.fixed=new THREE.Group();this.furn=new THREE.Group();this.fx=new THREE.Group();this.dec=new THREE.Group();this.lit=new THREE.Group();this.s.add(this.fixed,this.furn,this.fx,this.dec,this.lit);this.build();this.s.add(new THREE.HemisphereLight(0xfff4dc,0x66717a,.5));new ResizeObserver(()=>this.resize()).observe(el);this.resize();this.anim()}
box(w,h,d,m,x,y,z){let q=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);q.position.set(x,y,z);return q}cyl(r,h,m,x,y,z){let q=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,24),m);q.position.set(x,y,z);return q}clear(g){while(g.children.length)g.remove(g.children[0])}
build(){this.fixed.add(this.box(13,.14,9,new THREE.MeshStandardMaterial({color:0x815d43}),0,0,-.4),this.box(13,5.8,.14,this.wall,0,2.9,-4.9),this.box(.14,5.8,9,this.wall,-6.5,2.9,-.4),this.box(.14,5.8,9,this.wall,6.5,2.9,-.4),this.box(13,.14,9,this.white,0,5.8,-.4));this.fixed.add(this.box(6.8,.03,4.4,new THREE.MeshStandardMaterial({color:0xc6b79f}),0,.09,-.1),this.box(2.3,.18,1.15,this.wood,0,.62,.45));for(const x of [-.92,.92])for(const z of [.05,.85])this.fixed.add(this.box(.12,.55,.12,this.wood,x,.32,z));this.fixed.add(this.box(3.35,2.85,.1,this.wood,-3.85,3.05,-4.77),this.box(2.98,1.62,.025,new THREE.MeshStandardMaterial({color:0x8fc4dc}),-3.85,3.48,-4.73),this.box(2.98,.82,.025,new THREE.MeshStandardMaterial({color:0x718d5d}),-3.85,2.26,-4.72),this.box(.07,2.48,.05,this.white,-3.85,3.05,-4.56),this.box(2.98,.07,.05,this.white,-3.85,3.05,-4.56))}
chair(x,z,rot=0,m=this.fabric2){let g=new THREE.Group();g.add(this.box(1.12,.46,1.12,m,0,.56,0),this.box(1.12,.86,.2,m,0,1.15,-.46));g.position.set(x,0,z);g.rotation.y=rot;this.furn.add(g)}sofa(x,z,w,rot=0,m=this.fabric){let g=new THREE.Group();g.add(this.box(w,.48,1.15,m,0,.58,0),this.box(w,.82,.22,m,0,1.15,-.48));g.position.set(x,0,z);g.rotation.y=rot;this.furn.add(g)}
setF(t){this.clear(this.furn);if(t==="connected-l"){this.furn.add(this.box(4.85,.5,1.18,this.fabric,.3,.58,-2.55),this.box(1.2,.5,2.95,this.fabric,-1.48,.58,-1.65),this.box(4.85,.82,.22,this.fabric,.3,1.15,-3.03),this.box(.22,.82,2.75,this.fabric,-2.02,1.15,-1.67))}if(t==="sofa-chairs"){this.sofa(0,-2.55,3.55);this.chair(-3,-.35,Math.PI/3);this.chair(3,-.35,-Math.PI/3)}if(t==="sofa-beanbag"){this.sofa(-.65,-2.55,3.25);let m=new THREE.MeshStandardMaterial({color:0x9b715b,roughness:1}),b=new THREE.Mesh(new THREE.SphereGeometry(1,32,22),m);b.scale.set(1.18,.52,1.05);b.position.set(2.65,.48,-.30);b.rotation.z=.08;this.furn.add(b);let bt=new THREE.Mesh(new THREE.SphereGeometry(.78,28,20),m);bt.scale.set(.88,.82,.78);bt.position.set(2.48,.92,-.56);bt.rotation.z=-.24;this.furn.add(bt);let bg=new THREE.Mesh(new THREE.SphereGeometry(.48,24,16),m);bg.scale.set(1.05,.65,.9);bg.position.set(3.10,.67,-.05);bg.rotation.z=.35;this.furn.add(bg)}if(t==="four-armchairs"){this.chair(-2.1,-1.85,Math.PI/4);this.chair(2.1,-1.85,-Math.PI/4);this.chair(-2.1,1.05,Math.PI*.72);this.chair(2.1,1.05,-Math.PI*.72);this.furn.add(this.cyl(.68,.1,this.wood,0,.58,-.25),this.cyl(.1,.54,this.wood,0,.3,-.25))}}
setW(t){this.clear(this.fx);this.wall.color.setHex({neutral:0xeee8df,warm:0xb96f4f,dark:0x30363a,brick:0x6f4035}[t]);if(t==="brick"){let ms=[0x5d3029,0x71392e,0x472722].map(c=>new THREE.MeshStandardMaterial({color:c,roughness:1}));for(let r=0;r<18;r++){let y=.25+r*.31,o=(r%2)*.38;for(let x=-6.1-o;x<6.2;x+=.77)this.fx.add(this.box(.7,.26,.04,ms[(r+Math.floor(x+10))%3],x,y,-4.78));for(let side of [-1,1])for(let z=-4.35-o;z<3.65;z+=.77)this.fx.add(this.box(.04,.26,.7,ms[(r+Math.floor(z+10))%3],side*6.38,y,z))}}}
plant(x,z,s){this.dec.add(this.cyl(.3*s,.45*s,this.wood,x,.25*s,z));for(let i=0;i<7;i++)this.dec.add(this.box(.12*s,.7*s,.05*s,this.green,x+(i%3-1)*.16*s,.75*s+(i%2)*.18*s,z+((i*2)%3-1)*.14*s))}
setD(t){this.clear(this.dec);if(t==="botanical"){this.plant(4.6,-3.7,1.5);this.plant(-4.8,.5,.9);this.plant(3.5,1.5,.65)}if(t==="artistic"){for(const [x,y,w,h,c] of [[-.8,3.5,1.2,1.3,0xb54e3c],[.8,3.1,1.4,.9,0x3f6f80],[2.5,3.5,1,1.2,0xd09b43]])this.dec.add(this.box(w,h,.04,new THREE.MeshStandardMaterial({color:c}),x,y,-4.66))}if(t==="eclectic"){this.plant(4.5,-3.8,.7);this.dec.add(this.box(1.6,1.2,.05,new THREE.MeshStandardMaterial({color:0xa4775f}),.3,3.3,-4.66))}}
setL(t){this.clear(this.lit);let add=(x,y,z,p,col=0xffc98d)=>{let l=new THREE.PointLight(col,p,10,1.4);l.position.set(x,y,z);this.lit.add(l)};if(t==="bright-overhead")for(const [x,z] of [[-3,-1.7],[0,-1.7],[3,-1.7],[-3,1.4],[0,1.4],[3,1.4]]){this.lit.add(this.cyl(.18,.06,this.white,x,5.5,z));add(x,5.15,z,16,0xffe6c7)}if(t==="localized-lamps")for(const [x,z] of [[-4.2,-.6],[4.2,-.6]]){this.lit.add(this.cyl(.08,2.1,this.dark,x,1.1,z),this.cyl(.55,.62,this.white,x,2.25,z));add(x,2.15,z,38)}if(t==="pendant-cluster")for(const [x,y,z] of [[-1.15,4.25,-.45],[0,3.92,-.15],[1.15,4.35,-.45]]){this.lit.add(this.cyl(.035,1.25,this.dark,x,y+.65,z));let sh=new THREE.Mesh(new THREE.ConeGeometry(.38,.48,24,1,true),new THREE.MeshStandardMaterial({color:0x5e625f,side:THREE.DoubleSide}));sh.position.set(x,y,z);this.lit.add(sh);add(x,y-.18,z,24)}if(t==="dramatic"){let ring=new THREE.Mesh(new THREE.TorusGeometry(1.1,.06,10,40),this.dark);ring.rotation.x=Math.PI/2;ring.position.set(0,4,-.3);this.lit.add(ring);for(let i=0;i<10;i++){let a=i*Math.PI/5,x=Math.cos(a)*1.1,z=-.3+Math.sin(a)*1.1;this.lit.add(this.cyl(.1,.25,this.white,x,3.5,z));let dr=new THREE.Mesh(new THREE.OctahedronGeometry(.11),new THREE.MeshStandardMaterial({color:0xe9d8bd,roughness:.25}));dr.position.set(x,3.18,z);this.lit.add(dr);add(x,3.45,z,8)}}}
set(c){this.setF(c.furniture);this.setW(c.wall);this.setD(c.decor);this.setL(c.lighting)}resize(){let w=this.el.clientWidth,h=this.el.clientHeight;this.cam.aspect=w/h;this.cam.updateProjectionMatrix();this.r.setSize(w,h,false)}anim(){this.r.render(this.s,this.cam);requestAnimationFrame(()=>this.anim())}}
const V={cur:new Room(document.querySelector("#cur")),a:new Room(document.querySelector("#v0")),b:new Room(document.querySelector("#v1")),c:new Room(document.querySelector("#v2")),d:new Room(document.querySelector("#v3"))};
function renderCard(i){let card=document.querySelector("#c"+i);if(i<candidates.length){card.classList.remove("hidden");V[["a","b","c","d"][i]].set(candidates[i])}else card.classList.add("hidden")}
function ui(){const kCtl=document.querySelector("#kctl"),fCtl=document.querySelector("#fctl"),ev=document.querySelector("#eval"),op=document.querySelector("#options"),none=document.querySelector("#none"),pc=document.querySelector("#preferCurrent"),q=document.querySelector("#question");document.querySelectorAll(".modes button").forEach(b=>b.classList.toggle("active",b.dataset.mode===mode));kCtl.classList.toggle("hidden",mode!=="compare");fCtl.classList.toggle("hidden",mode!=="replace");ev.classList.toggle("hidden",mode!=="eval");op.classList.toggle("hidden",mode==="eval");none.classList.toggle("hidden",mode==="eval");pc.classList.toggle("hidden",mode==="eval");if(mode==="compare"){q.textContent=`Do you prefer one of the newer ${k} room${k===1?"":"s"} or the current one?`;op.className=`options k${k}`;for(let i=0;i<4;i++)renderCard(i)}else if(mode==="replace"){q.textContent="Would you prefer a change in a single feature as shown below?";op.className="options k3";for(let i=0;i<4;i++)renderCard(i)}else{q.textContent="Evaluate the current room";for(let i=0;i<4;i++)document.querySelector("#c"+i).classList.add("hidden")}}
function draw(){V.cur.set(current);ui()}
function choose(i){
  if(!candidates[i]) return;
  advance("prefer_new",candidates[i],true);
}
for(let i=0;i<4;i++)document.querySelector("#b"+i).onclick=()=>choose(i);

document.querySelector("#preferCurrent").onclick=()=>advance("prefer_current",current,false);
document.querySelector("#none").onclick=()=>advance("prefer_none",null,false);

// Evaluation is one response in the ongoing interaction.
// Accept/reject do NOT terminate; the next query type is randomly selected.
document.querySelector("#accept").onclick=()=>advance("accept",current,false);
document.querySelector("#reject").onclick=()=>advance("reject",current,false);

document.querySelector("#satisfied").onclick=()=>{
  log("satisfied",current);
  ended=true;
  document.querySelector("#interactionArea").classList.add("hidden");
  document.querySelector("#endScreen").classList.remove("hidden");
  document.querySelector("#endMessage").textContent=`The game has ended in ${turn} turn${turn===1?"":"s"}.`;
};
document.querySelector("#restart").onclick=()=>location.reload();

// These controls remain exposed only because this is a sample site.
document.querySelectorAll(".modes button").forEach(b=>b.onclick=()=>{
  mode=b.dataset.mode;gen();draw();log("query_mode_changed");
});
document.querySelector("#k").onchange=e=>{
  k=Number(e.target.value);gen();draw();log("k_changed");
};
document.querySelector("#feature").onchange=e=>{
  replacementFeature=e.target.value;gen();draw();log("replacement_feature_changed");
};

gen();draw();log("start");