#include <algorithm>
#include <cmath>
#include <fstream>
#include <iostream>
#include <vector>
#include <omp.h>
constexpr double PI=3.14159265358979323846;
struct V { double x,y,z; V(double a=0):x(a),y(a),z(a){} V(double a,double b,double c):x(a),y(b),z(c){} V operator+(V b)const{return {x+b.x,y+b.y,z+b.z};} V operator-(V b)const{return {x-b.x,y-b.y,z-b.z};} V operator-()const{return {-x,-y,-z};} V operator*(double b)const{return {x*b,y*b,z*b};} V operator/(double b)const{return *this*(1/b);} V operator*(V b)const{return {x*b.x,y*b.y,z*b.z};} V&operator+=(V b){x+=b.x;y+=b.y;z+=b.z;return *this;} };
V operator*(double a,V b){return b*a;} double dot(V a,V b){return a.x*b.x+a.y*b.y+a.z*b.z;} V cross(V a,V b){return {a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x};} double len(V a){return sqrt(dot(a,a));} V norm(V a){return a/(len(a)+1e-30);} V mix(V a,V b,double t){return a*(1-t)+b*t;} double clamp(double x,double lo=0,double hi=1){return std::max(lo,std::min(hi,x));} double smooth(double a,double b,double x){x=clamp((x-a)/(b-a));return x*x*(3-2*x);} double fract(double x){return x-floor(x);} V reflect(V d,V n){return d-n*(2*dot(d,n));}
V ry(V p,double a){return {cos(a)*p.x+sin(a)*p.z,p.y,-sin(a)*p.x+cos(a)*p.z};} V rx(V p,double a){return {p.x,cos(a)*p.y-sin(a)*p.z,sin(a)*p.y+cos(a)*p.z};} V rz(V p,double a){return {cos(a)*p.x-sin(a)*p.y,sin(a)*p.x+cos(a)*p.y,p.z};}
double ay,ax,az; V world(V p){return rz(rx(ry(p,ay),ax),az);} V local(V p){return ry(rx(rz(p,-az),-ax),-ay);}
struct Ray{V o,d;}; struct Hit {double t=1e30; V p,n;int mat=-1,id=-1;};
struct Profile {double z,r;}; struct Body {double cx,cy,half,bevel;V offset; std::vector<Profile> rings;int mat;bool hole=false;}; std::vector<Body> bodies;
double rr(V p,double cx,double cy){return hypot(std::max(0.0,fabs(p.x)-cx),std::max(0.0,fabs(p.y)-cy));}
void take(Hit& h,Ray ray,double t,V n,int mat,int id){if(t>0.0001&&t<h.t){h.t=t;h.p=ray.o+ray.d*t;h.n=norm(n);h.mat=mat;h.id=id;}}
void addBody(double cx,double cy,double radius,double half,double bevel,double z,int mat,bool hole=false){
  Body b{cx,cy,half,bevel,V(0,0,z),{},mat,hole};
  for(int i=0;i<=10;i++){double a=(PI/2)*i/10;b.rings.push_back({-half+bevel-bevel*cos(a),radius-bevel+bevel*sin(a)});}
  for(int i=0;i<=10;i++){double a=(PI/2)*i/10;b.rings.push_back({half-bevel+bevel*sin(a),radius-bevel+bevel*cos(a)});}
  bodies.push_back(b);
}
void build(double p){
  bodies.clear(); double ease=p*p*(3-2*p),spacing=.70-.33*ease;
  for(int i=0;i<3;i++){
    double z=(1-i)*spacing;
    addBody(.79,.87,.34,.17,.073,z,0,true);
    // The lacquered ceramic insert is physically recessed, bounded by its own
    // curved rim. A black reveal occupies the machined pocket surrounding it.
    addBody(.775,.855,.235,.017,.014,z+.14,2,false);
  }
}
bool boxCull(Ray r,V half,double limit){double a=0,b=limit;for(int k=0;k<3;k++){double o=(&r.o.x)[k],d=(&r.d.x)[k],h=(&half.x)[k]; if(fabs(d)<1e-12){if(fabs(o)>h)return false;continue;} double u=(-h-o)/d,v=(h-o)/d;if(u>v)std::swap(u,v);a=std::max(a,u);b=std::min(b,v);if(a>b)return false;}return true;}
V bevelNormal(V n,V p,const Body& b){
  double z=std::abs(p.z),nz=clamp((z-(b.half-b.bevel))/b.bevel),side=sqrt(std::max(0.0,1-nz*nz));
  V xy=norm(V(n.x,n.y,0)); return {xy.x*side,xy.y*side,(p.z<0?-1:1)*nz};
}
void intersectBody(Hit& hit,Ray ray,const Body& b,int id){
  Ray q{ray.o-b.offset,ray.d}; if(!boxCull(q,{b.cx+.35,b.cy+.35,.18},hit.t))return;
  // Exact planar end faces with an open machined insert pocket.
  for(int side=0;side<2;side++){auto p=side?b.rings.back():b.rings.front();if(fabs(q.d.z)<1e-12)continue;double t=(p.z-q.o.z)/q.d.z;if(t<=.0001||t>=hit.t)continue;V h=q.o+q.d*t;if(rr(h,b.cx,b.cy)>p.r)continue;
    if(b.hole&&side&&rr(h,.775,.855)<.254)continue;
    take(hit,ray,t,{0,0,side?1.0:-1.0},b.mat,id);
  }
  for(int i=0;i<int(b.rings.size())-1;i++){
    Profile a=b.rings[i],c=b.rings[i+1];if(c.z-a.z<1e-9)continue;double k=(c.r-a.r)/(c.z-a.z),s=a.r-k*a.z;
    // Four planar ruled surfaces.
    for(int axis=0;axis<2;axis++)for(int sign:{-1,1}){double center=axis==0?b.cx:b.cy,other=axis==0?b.cy:b.cx;double o=axis==0?q.o.x:q.o.y,d=axis==0?q.d.x:q.d.y;double den=sign*d-k*q.d.z;if(fabs(den)<1e-12)continue;double t=(center+s-sign*o+k*q.o.z)/den;if(t<=.0001||t>=hit.t)continue;V h=q.o+q.d*t;if(h.z<a.z-1e-8||h.z>c.z+1e-8||fabs(axis==0?h.y:h.x)>other)continue;V n=axis==0?V(sign,0,-k):V(0,sign,-k);int m=b.mat;if(b.mat==0&&fabs(h.z)<.073)m=1;take(hit,ray,t,bevelNormal(n,h,b),m,id);}
    // Four analytic conical quadrants, exact at each bevel profile interval.
    for(int sx:{-1,1})for(int sy:{-1,1}){V o=q.o-V(sx*b.cx,sy*b.cy,0);double A=q.d.x*q.d.x+q.d.y*q.d.y-k*k*q.d.z*q.d.z,B=2*(o.x*q.d.x+o.y*q.d.y-(k*o.z+s)*k*q.d.z),C=o.x*o.x+o.y*o.y-(k*o.z+s)*(k*o.z+s);double det=B*B-4*A*C;if(det<0)continue;double ts[2];if(fabs(A)<1e-12){ts[0]=ts[1]=-C/B;}else{ts[0]=(-B-sqrt(det))/(2*A);ts[1]=(-B+sqrt(det))/(2*A);}for(double t:ts){if(t<=.0001||t>=hit.t)continue;V h=o+q.d*t;if(h.z<a.z-1e-8||h.z>c.z+1e-8||sx*h.x<0||sy*h.y<0)continue;int m=b.mat;if(b.mat==0&&fabs(h.z)<.073)m=1;take(hit,ray,t,bevelNormal({h.x,h.y,0},h,b),m,id);}}
  }
  // Real dark pocket floor, behind the separate insert and below titanium rim.
  if(b.hole&&fabs(q.d.z)>1e-12){double t=(.125-q.o.z)/q.d.z;V h=q.o+q.d*t;if(rr(h,.775,.855)<.254)take(hit,ray,t,{0,0,1},3,id);}
}
bool scene(Ray ray,Hit& h){for(int i=0;i<int(bodies.size());i++)intersectBody(h,ray,bodies[i],i);return h.mat>=0;}
struct Light{V c,u,v,color;};
std::vector<Light> lights={
 {{-3.4,3.9,3.6},{2.4,0,0},{0,.72,-.7},{5.6,5.7,5.9}},
 {{3.2,1.3,1.8},{.22,0,-.3},{0,2.7,0},{3.2,2.8,4.3}},
 {{-.4,2.4,-3.2},{2.5,0,0},{0,1.05,.6},{4.5,4.45,4.7}},
 {{-3.2,-.6,2.3},{.16,0,.3},{0,2.4,0},{2.6,2.8,3.15}},
 {{-4.2,-.25,1.35},{-.05,0,.75},{0,2.6,0},{1.3,1.26,1.4}},
 {{0,1.4,5.2},{3.3,0,0},{0,2.6,0},{.24,.20,.32}},
};
V env(V d,double rough){V c=mix(V(.037,.027,.05),V(.10,.085,.12),clamp(d.y*.5+.5));for(auto &l:lights){V n=norm(cross(l.u,l.v));double den=dot(d,n);if(fabs(den)<1e-10)continue;double t=dot(l.c,n)/den;if(t<=0)continue;V p=d*t-l.c;double u=dot(p,l.u)/dot(l.u,l.u),v=dot(p,l.v)/dot(l.v,l.v);double spread=rough*4;double f=(1-smooth(.80-spread,1.05+spread,fabs(u)))*(1-smooth(.80-spread,1.05+spread,fabs(v)));c+=l.color*f;}return c;}
bool shadow(V p,V d,double tmax){Hit h;scene({local(p+d*.0005),local(d)},h);return h.t<tmax;}
V trace(Ray ray,int depth=0,double rough=.10){Hit h;if(!scene({local(ray.o),local(ray.d)},h))return env(ray.d,rough);V p=world(h.p),n=world(h.n);if(dot(ray.d,n)>0)n=-n;double nv=clamp(-dot(ray.d,n));V rd=reflect(ray.d,n);double r=.115;V f0(.60,.62,.65),base(0);if(h.mat==1){f0=V(.29,.30,.34);r=.19;}if(h.mat==2){f0=V(.105,.095,.135);base=V(.075,.036,.115);r=.065;}if(h.mat==3){f0=V(.025,.021,.034);r=.17;}
  V f=f0+(V(1)-f0)*pow(1-nv,5);V re=depth<2?trace({p+rd*.0006,rd},depth+1,r):env(rd,r);V c=re*f;
  V direct(0);if(depth<2)for(auto &l:lights){V delta=l.c-p;double dist=len(delta);V d=delta/dist;double nl=dot(n,d);if(nl<=0)continue;if(shadow(p,d,dist))continue;double area=4*len(cross(l.u,l.v));direct+=l.color*(area/(dist*dist)*nl/PI);}
  c+=direct*(h.mat==2?base:f0*.065);c+=(h.mat==2?base*.45:f0*.011);return c;
}
unsigned hash(unsigned x){x^=x>>16;x*=0x7feb352d;x^=x>>15;x*=0x846ca68b;x^=x>>16;return x;}double linear(double x){return x<=.04045?x/12.92:pow((x+.055)/1.055,2.4);}double srgb(double x){return x<=.0031308?x*12.92:1.055*pow(x,1/2.4)-.055;}double tone(double x){return (x*(2.51*x+.03))/(x*(2.43*x+.59)+.14);}
int main(int argc,char**argv){int size=argc>1?atoi(argv[1]):720,spp=argc>2?atoi(argv[2]):12,frame=argc>3?atoi(argv[3]):0,total=argc>4?atoi(argv[4]):48;std::string file=argc>5?argv[5]:"preview.ppm";double phase=double(frame)/(total-1),e=phase*phase*(3-2*phase);
  ay=(-35+11*e)*PI/180;ax=(19-8*e)*PI/180;az=(-11+8*e)*PI/180;build(phase);
  V camera(0,0,8.325),forward(0,0,-1),right(1,0,0),up(0,1,0);double scale=tan(27.8*PI/360);std::vector<unsigned char> pix(size*size*3);V bg(linear(20/255.0),linear(15/255.0),linear(27/255.0));double start=omp_get_wtime();
  #pragma omp parallel for schedule(dynamic,2)
  for(int y=0;y<size;y++)for(int x=0;x<size;x++){V col(0);unsigned b=hash(x+size*y+542712);
    for(int s=0;s<spp;s++){double jx=fract((s+.5)*.754877666+double(hash(b))/4294967296.0),jy=fract((s+.5)*.569840296+double(hash(b+1))/4294967296.0);Ray ray{camera,norm(forward+right*((2*(x+jx)/size-1)*scale)+up*((1-2*(y+jy)/size)*scale))};Hit h;if(!scene({local(ray.o),local(ray.d)},h)){col+=bg;continue;}V c=trace(ray);double lum=dot(c,V(.2126,.7152,.0722));double mapped=tone(lum*.70);c=c*(mapped/(lum+1e-9));c=mix(c,V(mapped),.11*smooth(.6,1.0,mapped));col+=c;}
    col=col/spp;int i=(y*size+x)*3;pix[i]=round(255*clamp(srgb(col.x)));pix[i+1]=round(255*clamp(srgb(col.y)));pix[i+2]=round(255*clamp(srgb(col.z)));}
  std::ofstream out(file,std::ios::binary);out<<"P6\n"<<size<<" "<<size<<"\n255\n";out.write((char*)pix.data(),pix.size());std::cerr<<file<<" "<<omp_get_wtime()-start<<" seconds\n";
}
