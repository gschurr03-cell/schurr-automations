import html from '@/site-html/brand-directions/index.html?raw';
export function GET(){return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=0, must-revalidate','X-Robots-Tag':'noindex, nofollow'}});}
