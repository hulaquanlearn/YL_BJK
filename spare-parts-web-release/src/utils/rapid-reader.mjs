const keywords=new Set('MODULE ENDMODULE PROC ENDPROC FUNC ENDFUNC TRAP ENDTRAP RECORD ENDRECORD LOCAL TASK PERS VAR CONST ALIAS IF THEN ELSE ELSEIF ENDIF WHILE DO ENDWHILE FOR FROM TO STEP ENDFOR TEST CASE DEFAULT ENDTEST RETURN GOTO EXIT RAISE RETRY TRYNEXT ERROR UNDO BACKWARD INOUT REF NOSTEPIN SYSMODULE VIEWONLY READONLY TRUE FALSE AND OR NOT XOR DIV MOD'.split(' '))
const types=new Set('num dnum bool string robtarget jointtarget tooldata wobjdata speeddata zonedata loaddata pose orient pos confdata extjoint signaldi signaldo signalai signalao signalgi signalgo clock intnum errnum socketdev'.split(' '))
const instructions=new Set('movej movel movec moveabsj accset velset set reset setdo setao setgo waitdi waitdo waituntil waittime stop tpwrite tpreadnum tpreadfk pulseDO confj confl reltool offs orientzyx sin cos abs trunc round'.toLowerCase().split(' '))
// Display tokens only. All text is rendered through Vue interpolation, never HTML.
export function rapidTokens(line=''){
 const tokens=[];let i=0
 while(i<line.length){const start=i,c=line[i];let kind='plain'
  if(c==='!'){i=line.length;kind='comment'}
  else if(c==='"'){i++;while(i<line.length){if(line[i]==='\\'&&i+1<line.length){i+=2;continue}if(line[i]==='"'){if(line[i+1]==='"'){i+=2;continue}i++;break}i++}kind='string'}
  else{const word=line.slice(i).match(/^[A-Za-z_][A-Za-z_0-9]*/);const number=line.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?/)
   if(word){i+=word[0].length;const value=word[0];kind=keywords.has(value.toUpperCase())?'keyword':types.has(value.toLowerCase())?'type':instructions.has(value.toLowerCase())?'instruction':'plain'}
   else if(number){i+=number[0].length;kind='number'}else{while(i<line.length&&!/[!"A-Za-z_0-9.]/.test(line[i]))i++;if(i===start)i++}
  }
  tokens.push({text:line.slice(start,i),kind})
 }
 return tokens
}
export function rapidDocument(text=''){
 return {lines:text.split(/\r\n|\n|\r/).map((text,i)=>({number:i+1,text,tokens:rapidTokens(text)}))}
}
