import assert from 'node:assert/strict';
import test from 'node:test';
import {createVoiceInput} from '../public/speech.js';

test('dictation returns editable text in the game language and ignores cancelled sessions', () => {
  let active;
  class Recognition { constructor(){active=this;} start(){} abort(){} }
  const voice=createVoiceInput(Recognition);
  const cities=[], statuses=[];
  const begin=lang=>voice.toggle(lang,city=>cities.push(city),value=>statuses.push(value));
  begin('ru');
  assert.equal(active.lang,'ru-RU');
  active.onresult({resultIndex:0,results:[[{transcript:'Москва.'}]]});
  active.onend();
  assert.deepEqual(cities,['Москва']);
  assert.equal(statuses.at(-1),'review');
  begin('en');
  assert.equal(active.lang,'en-US');
  voice.cancel();
  active.onresult({resultIndex:0,results:[[{transcript:'Paris'}]]});
  assert.deepEqual(cities,['Москва']);
});

test('unsupported recognition and denied microphone produce feedback',()=>{
  let status;
  const feedback=s=>{status=s;};
  createVoiceInput(undefined).toggle('en',()=>{},feedback);
  assert.equal(status,'unsupported');
  let active;
  class Recognition { constructor(){active=this;} start(){} }
  createVoiceInput(Recognition).toggle('en',()=>{},feedback);
  active.onerror({error:'not-allowed'});
  active.onend();
  assert.equal(status,'not-allowed');
});

