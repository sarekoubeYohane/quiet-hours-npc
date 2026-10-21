/* eslint-disable @typescript-eslint/no-require-imports */
const {approval}=require('./routine-program-fixture.cjs'),shared=require('../tooling/verification/routine-results-fixture.cjs');
module.exports={uncertain:()=>shared.uncertain(approval),raw:shared.raw};
