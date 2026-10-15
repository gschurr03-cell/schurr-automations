import html from '@/site-html/examples/dealership/inquire/index.html?raw';
export function GET(){return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=0, must-revalidate','X-Robots-Tag':'noindex, follow'}});}
