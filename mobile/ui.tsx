import {Pressable,StyleSheet,Text} from 'react-native';

export const palette=(light:boolean)=>light?{bg:'#f4f5ef',panel:'#fff',text:'#192017',muted:'#515e4e',accent:'#41621c',onAccent:'#fff',line:'#d9ded4'}:
  {bg:'#141518',panel:'#1c1e20',text:'#f0f1ed',muted:'#a9b0a5',accent:'#b9f658',onAccent:'#182012',line:'#343832'};
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
