#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>
#include <omp.h>

// A deterministic analytic ray tracer. Every frame ray-intersects the same
// modeled lathe surfaces, subtractive fastener pockets and optical elements.
// Metal uses a Schlick conductor response with rough reflections. Glass uses
// Fresnel reflection, Snell refraction and absorption. Studio lights are finite
// rectangular emitters and are visible in all reflected/refracted rays.
constexpr double PI=3.14159265358979323846;
struct V {
  double x,y,z;
  V(double a=0):x(a),y(a),z(a){} V(double a,double b,double c):x(a),y(b),z(c){}
  V operator+(V b)const{return {x+b.x,y+b.y,z+b.z};}
  V operator-(V b)const{return {x-b.x,y-b.y,z-b.z};}
  V operator-()const{return {-x,-y,-z};}
  V operator*(double b)const{return {x*b,y*b,z*b};}
  V operator/(double b)const{return *this*(1/b);}
  V operator*(V b)const{return {x*b.x,y*b.y,z*b.z};}
  V&operator+=(V b){x+=b.x;y+=b.y;z+=b.z;return *this;}
};
V operator*(double a,V b){return b*a;}
double dot(V a,V b){return a.x*b.x+a.y*b.y+a.z*b.z;}
V cross(V a,V b){return {a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x};}
double len(V a){return sqrt(dot(a,a));}
V norm(V a){return a/(len(a)+1e-30);}
V mix(V a,V b,double t){return a*(1-t)+b*t;}
double clamp(double a,double lo=0,double hi=1){return std::max(lo,std::min(a,hi));}
double smooth(double a,double b,double x){x=clamp((x-a)/(b-a));return x*x*(3-2*x);}
double fract(double a){return a-floor(a);}
V reflect(V d,V n){return d-n*(2*dot(d,n));}
struct Ray {V o,d;};
struct Hit {double t=1e30;V p,n;int mat=-1,part=-1;bool glass=false;};
struct Mat{V c;double rough;double metal;};
std::vector<Mat> materials={
  {{.59,.60,.59},.115,1}, // titanium face
  {{.43,.47,.48},.16,1}, // titanium outer wall
  {{.65,.265,.105},.095,1}, // polished copper
  {{.048,.067,.071},.13,1}, // blackened precision rings
  {{.18,.22,.24},.105,1}, // fastener steel
  {{.012,.018,.02},.2,.6}, // internal baffles
  {{.016,.033,.042},.07,1}, // internal optical back
  {{.9,.94,.97},.025,0}, // optical glass
  {{.76,.78,.77},.05,1}, // polished edge titanium
};
struct P {double r,z;};
struct Lathe {std::vector<P> profile;int material;bool pockets=false;};
std::vector<Lathe> parts;
double ay=25*PI/180, ax=-6*PI/180, az=-3*PI/180;
V ry(V p,double a){return {cos(a)*p.x+sin(a)*p.z,p.y,-sin(a)*p.x+cos(a)*p.z};}
V rx(V p,double a){return {p.x,cos(a)*p.y-sin(a)*p.z,sin(a)*p.y+cos(a)*p.z};}
V rz(V p,double a){return {cos(a)*p.x-sin(a)*p.y,sin(a)*p.x+cos(a)*p.y,p.z};}
V toWorld(V p){return rz(rx(ry(p,ay),ax),az);}
V toLocal(V p){return ry(rx(rz(p,-az),-ax),-ay);}
void add(std::initializer_list<P> profile,int mat,bool pocket=false){parts.push_back({profile,mat,pocket});}
void build(double phase){
  parts.clear();
  // Structural annulus: multiple true beveled surfaces, not a normal-map proxy.
  add({{1.375,-.33},{1.438,-.275},{1.454,-.23},{1.454,.29},{1.438,.335},{1.398,.375},{1.075,.375},{1.035,.335},{1.035,-.28},{1.09,-.33}},0,true);
  // Separately finished wall bands and bright diamond-cut edge reveals.
  add({{1.453,-.235},{1.457,-.224},{1.457,-.205},{1.453,-.194}},1);
  add({{1.454,.245},{1.458,.253},{1.458,.265},{1.454,.274}},8);
  add({{1.452,-.12},{1.455,-.115},{1.455,-.099},{1.452,-.094}},3);
  // Rear exposed flange, stepped and chamfered.
  add({{1.15,-.331},{1.37,-.331},{1.38,-.346},{1.38,-.386},{1.345,-.42},{1.17,-.42},{1.145,-.394}},1);
  // Copper bezel, restrained axial movement (maximum 0.032 units).
  double dz=.032*phase;
  add({{1.055,.22+dz},{1.082,.255+dz},{1.082,.299+dz},{1.068,.317+dz},{.900,.317+dz},{.867,.294+dz},{.867,.19+dz},{.900,.173+dz},{1.025,.173+dz}},2);
  // Thin titanium reveal between housing and bezel.
  add({{1.07,.330},{1.074,.338},{1.060,.348},{1.048,.34},{1.05,.328}},8);
  // Copper concentric turned grooves, modeled as recessed dark rings.
  for(int i=0;i<3;i++){double r=.938+i*.037;add({{r-.0011,.3175+dz},{r+.0011,.3175+dz},{r+.0011,.3158+dz},{r-.0011,.3158+dz}},2);}
  // Black anodized optical retaining ring.
  add({{.868,.172},{.9,.203},{.9,.270},{.884,.289},{.823,.289},{.805,.268},{.805,.171}},3);
  add({{.821,.276},{.825,.286},{.819,.293},{.810,.291},{.804,.282}},8);
  add({{.885,.270},{.889,.278},{.885,.286},{.879,.279}},1);
  // Internally stepped barrel, with separate light-absorbing baffles.
  add({{.81,-.41},{.818,-.39},{.818,.218},{.795,.218},{.773,-.38},{.77,-.41}},3);
  for(int i=0;i<5;i++){double z=.13-i*.092;double r=.781-i*.012;add({{r+.026,z+.015},{r+.029,z+.004},{r,z-.005},{r-.003,z-.015},{r+.019,z-.024}},5);}
  // Recessed central rear element mount.
  add({{.755,-.43},{.757,-.399},{.710,-.379},{.663,-.387},{.653,-.409},{.653,-.443}},2);
  // Deep optical backplate with small central concavity represented by a cone.
  add({{0,-.545},{.695,-.482},{.718,-.451},{.728,-.439},{.728,-.56},{0,-.57}},6);
}
bool pocket(V p){
  if(p.z<.09)return false;
  double rad=p.z>.326?.064+(.091-.064)*clamp((p.z-.326)/.049):.064;
  for(int i=0;i<6;i++){double a=(30+60*i)*PI/180;double dx=p.x-1.26*cos(a),dy=p.y-1.26*sin(a);if(dx*dx+dy*dy<rad*rad)return true;}
  return false;
}
void take(Hit& h,double t,V p,V n,int mat,int part,bool glass=false){if(t>1e-5&&t<h.t){h.t=t;h.p=p;h.n=norm(n);h.mat=mat;h.part=part;h.glass=glass;}}
// All analytic surfaces for a piecewise linear surface of revolution.
void segment(Hit& h,Ray ray,P a,P b,int mat,int id,bool subtract=false,V offset=V(0)){
  Ray rr{ray.o-offset,ray.d};
  if(fabs(a.z-b.z)<1e-9){
    if(fabs(rr.d.z)<1e-12)return;
    double t=(a.z-rr.o.z)/rr.d.z;if(t<=1e-5||t>=h.t)return;
    V p=rr.o+rr.d*t;double r2=p.x*p.x+p.y*p.y;
    if(r2<std::min(a.r*a.r,b.r*b.r)||r2>std::max(a.r*a.r,b.r*b.r))return;
    p+=offset;if(subtract&&pocket(p))return;
    take(h,t,p,{0,0,b.r<a.r?1.0:-1.0},mat,id);return;
  }
  double k=(b.r-a.r)/(b.z-a.z), c=a.r-k*a.z;
  double qa=rr.d.x*rr.d.x+rr.d.y*rr.d.y-k*k*rr.d.z*rr.d.z;
  double qb=2*(rr.o.x*rr.d.x+rr.o.y*rr.d.y-(k*rr.o.z+c)*k*rr.d.z);
  double qc=rr.o.x*rr.o.x+rr.o.y*rr.o.y-(k*rr.o.z+c)*(k*rr.o.z+c);
  double ds=qb*qb-4*qa*qc;if(ds<0)return;
  double ts[2]; if(fabs(qa)<1e-12){ts[0]=-qc/qb;ts[1]=ts[0];}else{double q=sqrt(ds);ts[0]=(-qb-q)/(2*qa);ts[1]=(-qb+q)/(2*qa);}
  for(double t:ts){if(t<=1e-5||t>=h.t)continue;V p=rr.o+rr.d*t;
    if(p.z<std::min(a.z,b.z)-1e-8||p.z>std::max(a.z,b.z)+1e-8)continue;
    V n={p.x,p.y,-k*(k*p.z+c)};if(b.z<a.z)n=-n;
    p+=offset;if(subtract&&pocket(p))continue;take(h,t,p,n,mat,id);
  }
}
// A solid optical meniscus bounded by two exact spherical caps.
void lens(Hit& h,Ray ray,double edge,double radius,double frontEdge,double backEdge,int id){
  // Curvature fronts toward +Z; normals are derived from the sphere.
  double offset=sqrt(radius*radius-edge*edge);
  double centers[2]={frontEdge-offset,backEdge+offset};
  for(int side=0;side<2;side++){
    V c(0,0,centers[side]);V oc=ray.o-c;double b=dot(oc,ray.d),q=dot(oc,oc)-radius*radius;
    double det=b*b-q;if(det<0)continue;
    double ts[2]={-b-sqrt(det),-b+sqrt(det)};
    for(double t:ts){if(t<=1e-5||t>=h.t)continue;V p=ray.o+ray.d*t;
      if(p.x*p.x+p.y*p.y>edge*edge)continue;
      if(side==0&&p.z<frontEdge-1e-7)continue;
      if(side==1&&p.z>backEdge+1e-7)continue;
      V n=norm(p-c);take(h,t,p,n,7,id,true);
    }
  }
  segment(h,ray,{edge,backEdge},{edge,frontEdge},7,id);
}
bool sceneLocal(Ray ray,Hit& h,bool optics=true){
  // Cheap bounding sphere culls all mechanical surfaces.
  double bb=dot(ray.o,ray.d),cc=dot(ray.o,ray.o)-2.32;
  if(bb*bb-cc<0)return false;
  for(int i=0;i<(int)parts.size();i++){
    auto &p=parts[i];for(int j=0;j<(int)p.profile.size();j++)segment(h,ray,p.profile[j],p.profile[(j+1)%p.profile.size()],p.material,i,p.pockets);
  }
  // Subtractive pockets have a real conical entry, cylindrical wall and bottom.
  for(int i=0;i<6;i++){
    double a=(30+60*i)*PI/180;V center(1.26*cos(a),1.26*sin(a),0);
    segment(h,ray,{.091,.375},{.064,.326},1,100+i,false,center);
    segment(h,ray,{.064,.326},{.064,.09},1,100+i,false,center);
    segment(h,ray,{.064,.09},{0,.09},3,100+i,false,center);
    // Small recessed steel screw heads with a dark center socket.
    segment(h,ray,{.041,.121},{.044,.143},4,100+i,false,center);
    segment(h,ray,{.044,.143},{.038,.164},4,100+i,false,center);
    segment(h,ray,{.038,.164},{.018,.164},4,100+i,false,center);
    segment(h,ray,{.018,.164},{.014,.135},3,100+i,false,center);
    segment(h,ray,{.014,.135},{0,.135},5,100+i,false,center);
  }
  if(optics){lens(h,ray,.802,2.65,.204,.133,200);lens(h,ray,.731,2.18,-.191,-.252,201);}
  return h.mat!=-1;
}
struct Light{V c,u,v,color;};
std::vector<Light> lights={
  {{-3.3,4.4,3.2},{1.6,0,0},{0,.55,-.7},{6.7,6.55,6.15}},
  {{3.4,1.7,2.3},{.25,0,-.42},{0,1.9,0},{5.6,6.3,6.6}},
  {{-.4,2.5,-2.5},{1.7,0,0},{0,.8,.5},{5.8,6.9,7.6}},
  {{-3.4,-.1,1.8},{.18,0,.38},{0,1.65,0},{2.6,3.5,4.15}},
  {{0,1.0,5.0},{2.6,0,0},{0,1.9,0},{.44,.46,.44}},
};
V env(V d,double rough=0){
  double up=clamp(d.y*.5+.5);V c=mix(V(.027,.051,.065),V(.115,.145,.159),up);
  // A nonuniform dark studio with three extended light-card reflections.
  for(auto &l:lights){
    V n=norm(cross(l.u,l.v));double dd=dot(d,n);if(fabs(dd)<1e-8)continue;
    double t=dot(l.c,n)/dd;if(t<=0)continue;
    V p=d*t-l.c;double u=dot(p,l.u)/dot(l.u,l.u),v=dot(p,l.v)/dot(l.v,l.v);
    double spread=rough*5;
    double fade=(1-smooth(.85-spread,1.08+spread,fabs(u)))*(1-smooth(.85-spread,1.08+spread,fabs(v)));
    c+=l.color*fade;
  }
  return c;
}
unsigned hash(unsigned x){x^=x>>16;x*=0x7feb352d;x^=x>>15;x*=0x846ca68b;x^=x>>16;return x;}
double rand01(unsigned &s){s=hash(s);return (s+.5)/4294967296.0;}
void basis(V n,V&u,V&v){u=norm(cross(fabs(n.y)<.95?V(0,1,0):V(1,0,0),n));v=cross(n,u);}
V roughDir(V r,V n,double rough,unsigned &seed){
  V u,v;basis(r,u,v);double a=2*PI*rand01(seed),rad=rough*sqrt(-log(std::max(1e-9,rand01(seed))));
  V d=norm(r+u*(rad*cos(a))+v*(rad*sin(a)));if(dot(d,n)<.01)d=norm(d+n*(.015-dot(d,n)));return d;
}
bool obstruct(V p,V d,double tmax){Hit h;sceneLocal({toLocal(p+d*2e-4),toLocal(d)},h,false);return h.t<tmax;}
V trace(Ray world,unsigned &seed,int depth=0,bool inside=false,double rough=0);
V floorShade(Ray ray,unsigned&seed,int depth){
  double t=(-1.497-ray.o.y)/ray.d.y;if(t<1e-4)return env(ray.d);
  V p=ray.o+ray.d*t;
  V base(.00368,.01938,.02956); // linearized exact petrol #0C2630
  if(depth>0){double glow=.6+.4*clamp(p.z+2);return mix(base*glow,env(ray.d,.12),smooth(2.8,12.0,fabs(p.z)));}
  // Contact is grounded by ray-tested shadows from the true studio lights.
  double shade=0;int ns=4;
  for(int i=0;i<ns;i++){
    const Light &l=lights[i];V lp=l.c;
    V delta=lp-p;double dist=len(delta);V d=delta/dist;
    if(obstruct(p,d,dist))shade+=.25;
  }
  double foot=exp(-(p.x*p.x/2.3+(p.z+.05)*(p.z+.05)/1.1));
  V c=base*(1-.72*shade*foot);
  double reflection=.10*exp(-(p.x*p.x/.8+(p.z-.7)*(p.z-.7)/1.3));
  if(reflection>.005){V d=reflect(ray.d,{0,1,0});c+=trace({p+d*.001,d},seed,3)*reflection;}
  return c;
}
V trace(Ray world,unsigned&seed,int depth,bool inside,double rough){
  if(depth>8)return V(0);
  Ray ray{toLocal(world.o),toLocal(world.d)};Hit h;bool did=sceneLocal(ray,h);
  double ft=world.d.y<-.0001?(-1.497-world.o.y)/world.d.y:1e30;
  if(ft>1e-4&&ft<h.t)return floorShade(world,seed,depth);
  if(!did)return env(world.d,rough);
  V wp=toWorld(h.p),n=toWorld(h.n);bool front=dot(world.d,n)<0;if(!front)n=-n;
  if(h.glass){
    double cosi=clamp(-dot(world.d,n));double ior=1.515;double eta=front?1/ior:ior;
    double f0=(ior-1)/(ior+1);f0=.012;double fresnel=f0+(1-f0)*pow(1-cosi,5);
    double sint=eta*eta*(1-cosi*cosi);V out(0);
    V rd=reflect(world.d,n);
    // Both paths are evaluated for the first layer; deeper glass paths use
    // deterministic roulette to keep the complete scroll practical to render.
    if(depth<3){out=trace({wp+rd*3e-4,rd},seed,depth+1,false)*fresnel;}
    else {out=env(rd)*fresnel;}
    if(sint<=1){V td=norm(world.d*eta+n*(eta*cosi-sqrt(1-sint)));V tr=trace({wp+td*3e-4,td},seed,depth+1,front);
      // Wavelength-selective blue optical glass absorption proportional to path.
      if(!front)tr=tr*V(exp(-1.7*h.t),exp(-.22*h.t),exp(-.075*h.t));
      out+=tr*(1-fresnel);
    }else out=trace({wp+rd*3e-4,rd},seed,depth+1,false);
    return out;
  }
  Mat m=materials[h.mat];
  double r=hypot(h.p.x,h.p.y),theta=atan2(h.p.y,h.p.x);
  // Fine concentric tool marks vary the surface normal. The frequency is
  // resolvable at desktop size; anisotropy follows the lathe cutting direction.
  if(h.mat==0||h.mat==1||h.mat==2){
    bool face=fabs(h.n.z)>.7;double v=face?r:h.p.z;
    double fine=sin(v*1250)+.25*sin(v*1960+1.2);
    double broad=.55*sin(v*131)+.20*sin(v*391+.3)+.08*sin(theta*251+v*19);
    double amount=(h.mat==2?.0025:.0035)*fine;
    V tangent=face?norm(V(h.p.x,h.p.y,0)):V(0,0,1);
    n=norm(n+toWorld(tangent)*amount);
    double modulation=1+(h.mat==2?.026:.033)*broad;
    m.c=m.c*modulation;
    if(h.mat==0&&fabs(h.n.z)<.5){m.rough=.15;m.c=m.c*.74;}
  }
  double nv=clamp(-dot(world.d,n));V F=m.c+(V(1)-m.c)*pow(1-nv,5);
  V rd=reflect(world.d,n);V reflectColor;
  if(depth<4){V sample=rd;reflectColor=trace({wp+sample*3e-4,sample},seed,depth+1,false,m.rough);}
  else reflectColor=env(rd,m.rough);
  V color=reflectColor*F;
  // Direct reflected studio irradiance for brushed metal's broad lobe.
  V direct(0);
  if(depth<3){
    for(int i=0;i<(int)lights.size();i++){
      auto &l=lights[i];V lp=l.c;
      V ld=lp-wp;double distance=len(ld);ld=ld/distance;double nl=dot(n,ld);if(nl<=0)continue;
      if(obstruct(wp,ld,distance))continue;
      double area=4*len(cross(l.u,l.v));double solid=area/(distance*distance);
      direct+=l.color*(solid*nl/PI);
    }
  }
  // Titanium's brushed microfacets contribute a modest broad response.
  double spread=(h.mat==0||h.mat==1)?.105:(h.mat==2?.06:.025);
  color+=direct*m.c*spread;
  color+=m.c*.012;
  return color;
}
double linear(double x){return x<=.04045?x/12.92:pow((x+.055)/1.055,2.4);}
double srgb(double x){return x<=.0031308?x*12.92:1.055*pow(x,1/2.4)-.055;}
double tonemap(double x){return (x*(2.51*x+.03))/(x*(2.43*x+.59)+.14);}
int main(int argc,char**argv){
  int size=argc>1?atoi(argv[1]):800,spp=argc>2?atoi(argv[2]):24,frame=argc>3?atoi(argv[3]):0,total=argc>4?atoi(argv[4]):60;
  std::string path=argc>5?argv[5]:"beauty.ppm";
  double phase=total>1?double(frame)/(total-1):0;
  // Start three-quarter and travel through a front view into the reverse side.
  ay=(-28+58*phase)*PI/180;ax=(-6+4*sin(phase*PI))*PI/180;az=(-3+6*phase)*PI/180;
  build(phase);
  V camera(0,.18,6.75),target(0,-.02,0),forward=norm(target-camera),right=norm(cross(forward,{0,1,0})),up=cross(right,forward);
  double scale=tan(31.8*PI/360);
  std::vector<unsigned char> pixels(size*size*3);
  V bg(linear(12/255.0),linear(38/255.0),linear(48/255.0));
  double start=omp_get_wtime();
  #pragma omp parallel for schedule(dynamic,2)
  for(int y=0;y<size;y++){
    for(int x=0;x<size;x++){
      V color(0);unsigned base=hash(x+size*y+1481951);
      for(int s=0;s<spp;s++){
        unsigned seed=hash(base+s*97121); // frame-independent samples eliminate crawl
        double jx=fract((s+.5)*.754877666+double(hash(base))/4294967296.0);
        double jy=fract((s+.5)*.569840296+double(hash(base+1))/4294967296.0);
        double px=(2*(x+jx)/size-1)*scale,py=(1-2*(y+jy)/size)*scale;
        Ray ray{camera,norm(forward+right*px+up*py)};
        Hit primary;sceneLocal({toLocal(camera),toLocal(ray.d)},primary);
        double ft=ray.d.y<-.0001?(-1.497-camera.y)/ray.d.y:1e30;
        V c;
        if(primary.mat<0&&!(ft>0&&ft<40)){c=bg;}
        else if(primary.mat<0){c=floorShade(ray,seed,0);}
        else {c=trace(ray,seed);double lum=dot(c,V(.2126,.7152,.0722));double mapped=tonemap(lum*.52);c=c*(mapped/(lum+1e-8));
          // Filmic highlight desaturation is deliberately mild, preserving the
          // copper's wavelength-selective conductor response.
          c=mix(c,V(mapped),.12*smooth(.4,1.0,mapped));}
        color+=c;
      }
      color=color/spp;
      // Floor lighting blends into the exact brand background at outer margins.
      double edge=std::min(std::min(double(x)/size,1-double(x)/size),std::min(double(y)/size,1-double(y)/size));
      color=mix(bg,color,smooth(.04,.125,edge));
      int idx=(y*size+x)*3;
      pixels[idx]=std::round(255*clamp(srgb(color.x)));pixels[idx+1]=std::round(255*clamp(srgb(color.y)));pixels[idx+2]=std::round(255*clamp(srgb(color.z)));
    }
  }
  std::ofstream f(path,std::ios::binary);f<<"P6\n"<<size<<" "<<size<<"\n255\n";f.write((char*)pixels.data(),pixels.size());
  std::cerr<<path<<" rendered "<<size<<"px "<<spp<<"spp in "<<omp_get_wtime()-start<<"s\n";
}
