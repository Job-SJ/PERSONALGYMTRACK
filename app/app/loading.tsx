export default function Loading(){
  return <main className="content" aria-busy="true">
    <p className="muted" role="status">Loading workspace</p>
    <div className="panel skeleton loading-heading" aria-hidden="true"/>
    <div className="split" aria-hidden="true"><div className="panel skeleton loading-skeleton"/><div className="panel skeleton loading-skeleton"/></div>
  </main>;
}
