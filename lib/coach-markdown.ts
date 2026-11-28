export function coachMarkdown(text:string){
  let code=false;
  return text.split('\n').flatMap(line=>{
    if(line.trimStart().startsWith('```')){code=!code;return [];}
    if(code) return [{kind:'code',parts:[{style:'plain',text:line}]}];
    const heading=line.match(/^#{1,6}\s+(.*)$/);
    const bullet=line.match(/^\s*[-*+]\s+(.*)$/);
    const ordered=line.match(/^\s*(\d+[.)])\s+(.*)$/);
    const content=heading?.[1]??(bullet?'• '+bullet[1]:ordered?ordered[1]+' '+ordered[2]:line);
    const parts=content.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).filter(Boolean).map(part=>{
      if(part.startsWith('**')&&part.endsWith('**')&&part.length>4) return {style:'strong',text:part.slice(2,-2)};
      if(part.startsWith('*')&&part.endsWith('*')&&part.length>2) return {style:'emphasis',text:part.slice(1,-1)};
      if(part.startsWith('`')&&part.endsWith('`')&&part.length>2) return {style:'code',text:part.slice(1,-1)};
      return {style:'plain',text:part};
    });
    return [{kind:heading?'heading':bullet||ordered?'list':'paragraph',parts}];
  });
}
