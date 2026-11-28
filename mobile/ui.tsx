import {Pressable,StyleSheet,Text} from 'react-native';

export const palette=(light:boolean,oled=false)=>light?
  {bg:'#f2f5f7',panel:'#fff',raised:'#e8eef2',text:'#18242d',muted:'#4d616d',accent:'#38651d',onAccent:'#fff',line:'#d3dde4'}:
  {bg:oled?'#000':'#0c1014',panel:oled?'#0a0c0e':'#141a21',raised:'#202933',text:'#f1f5f8',muted:'#a5b3bf',accent:'#b9ed7f',onAccent:'#182012',line:'#2a3541'};
export type Palette=ReturnType<typeof palette>;
export const ui=StyleSheet.create({
  safe:{flex:1},content:{padding:18,gap:14},title:{fontSize:28,fontWeight:'700',letterSpacing:-0.5},section:{fontSize:18,fontWeight:'700'},
  text:{fontSize:15,lineHeight:22},panel:{borderWidth:1,borderRadius:12,padding:14,gap:8},
  input:{minHeight:48,borderWidth:1,borderRadius:8,paddingHorizontal:12,fontSize:16},
  button:{minHeight:44,paddingHorizontal:12,paddingVertical:10,borderRadius:8,justifyContent:'center'},
  buttonText:{fontSize:15,fontWeight:'600'},row:{flexDirection:'row',flexWrap:'wrap',gap:8,alignItems:'center'},
});

export function Button({text,action,p,disabled=false,accent=false}:{text:string;action:()=>void;p:Palette;disabled?:boolean;accent?:boolean}){
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={action}
    style={[ui.button,{backgroundColor:accent?p.accent:p.panel,opacity:disabled?.5:1}]}>
    <Text style={[ui.buttonText,{color:accent?p.onAccent:p.text}]}>{text}</Text>
  </Pressable>;
}
