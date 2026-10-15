export default function NotFound() {
  return <main style={{minHeight:'100vh',background:'#100c18',color:'#f5eafa',padding:'12vh 8vw',fontFamily:'system-ui'}}>
    <p style={{color:'#c5a0e4',letterSpacing:2}}>SCHURR AUTOMATIONS</p>
    <h1 style={{fontWeight:400,fontSize:'clamp(36px,6vw,64px)',margin:'40px 0 24px'}}>This page could not be found.</h1>
    <p style={{fontSize:18,color:'#c8b4d7'}}>Return to the home page to explore services or contact Gavin.</p>
    <a href="/" style={{display:'inline-block',marginTop:30,padding:'16px 24px',background:'#c5a0e4',color:'#23112f',borderRadius:8}}>Return home</a>
  </main>;
}
