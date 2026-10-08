const WEAK_ASSERTION = ".toBeTruthy()";
export const CORRECT_COMMAND = `const input=await Bun.file(Bun.argv[2]).text();try{let total=0n;for(const row of input.split('\\n')){if(!row)continue;if(!/^(0|[1-9][0-9]*)$/.test(row))throw new Error('invalid count');total+=BigInt(row);}process.stdout.write(total.toString()+'\\n');}catch{process.stderr.write('invalid count\\n');process.exitCode=2;}`;
export const WRONG_OBLIGATION = CORRECT_COMMAND.replace("input.split('\\n')", "input.split('\\n').slice(0,-1)");
export const WRONG_COUNT = "const input=await Bun.file(Bun.argv[2]).text();process.stdout.write(String(input.trim().split('\\n').length)+'\\n');";
export const WRONG_FAILURE = CORRECT_COMMAND.replace("process.exitCode=2", "process.exitCode=0");
export const WRONG_FINDING = "const resolved=true;" + WRONG_COUNT;
export const POSITIVE_TEST = `import {test,expect} from 'bun:test';test('linked_input_result',()=>{const run=Bun.spawnSync([process.execPath,'src/cli.ts','input.txt'],{stdout:'pipe',stderr:'pipe'});expect(run.exitCode).toBe(0);expect(run.stdout.toString()).toBeTruthy();});`;
export const EXACT_TEST = POSITIVE_TEST.replace(WEAK_ASSERTION, ".toBe('5\\n')");
export const CIRCULAR_TEST = POSITIVE_TEST.replace(WEAK_ASSERTION, ".toBe(Bun.spawnSync([process.execPath,'src/cli.ts','input.txt'],{stdout:'pipe'}).stdout.toString())");
export const NEGATIVE_TEST = `import {test,expect} from 'bun:test';test('linked_invalid_result',async()=>{await Bun.write('invalid.txt','bad\\n');const run=Bun.spawnSync([process.execPath,'src/cli.ts','invalid.txt'],{stdout:'pipe',stderr:'pipe'});expect(run.exitCode).toBe(2);expect(run.stdout.toString()).toBe('');});`;

export const CORRECT_HELPER = "export function total(input){let total=0n;for(const row of input.split('\\n')){if(!row)continue;if(!/^(0|[1-9][0-9]*)$/.test(row))throw new Error('invalid count');total+=BigInt(row);}return total;}";
export const WIRED_COMMAND = `import {total} from './sum.ts';try{process.stdout.write(total(await Bun.file(Bun.argv[2]).text()).toString()+'\\n');}catch{process.exitCode=2;}`;
export const UNRELATED_NEGATIVE_TEST = `import {test,expect} from 'bun:test';test('different_failure',()=>{expect(()=>JSON.parse('bad')).toThrow();});`;
export const MUTATION_COMMAND = "process.stdout.write('wrong total\\n');process.exitCode=0;";
