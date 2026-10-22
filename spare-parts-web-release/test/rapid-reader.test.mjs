import test from 'node:test'
import assert from 'node:assert/strict'
import {rapidTokens,rapidDocument} from '../src/utils/rapid-reader.mjs'
test('RAPID display preserves every original character including whitespace, strings and escaped HTML',()=>{
 for(const line of ['    PERS robtarget p := [[1.25,-2E+09,.5]];','\tTPWrite "<img onerror=bad> ! text"; ! real comment','  TPWrite "a\\"b";','! PROC hidden()',''])assert.equal(rapidTokens(line).map(t=>t.text).join(''),line)
 const tokens=rapidTokens('  CONST num n:=1E-3; ! note');assert.ok(tokens.some(t=>t.text==='CONST'&&t.kind==='keyword'));assert.ok(tokens.some(t=>t.text==='num'&&t.kind==='type'));assert.ok(tokens.some(t=>t.text==='1E-3'&&t.kind==='number'));assert.equal(tokens.at(-1).kind,'comment')
})
test('source reading preserves all original lines without a folding structure',()=>{
 const source='MODULE Main\r\n  ! PROC ignored()\r\n  PROC main()\r\n    IF ready THEN\r\n      TPWrite "ENDPROC";\r\n    ENDIF\r\n  ENDPROC\r\nENDMODULE';const doc=rapidDocument(source);assert.equal(doc.lines.length,8);assert.deepEqual(doc.lines.map(line=>line.number),[1,2,3,4,5,6,7,8]);assert.equal(doc.lines.map(line=>line.text).join('\r\n'),source);assert.equal(doc.blocks,undefined);
 for(const text of ['IF ready THEN RETURN; ENDIF\nWaitTime 1;','MODULE Incomplete\n ! ENDMODULE'])assert.equal(rapidDocument(text).lines.map(line=>line.text).join('\n'),text)
})