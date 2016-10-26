const vpcsToAnalyze = new Map([
  ['Your First VPC Human Friendly Name', { VpcId: 'vpc-XYZWHATEVER', File: 'FirstFriendlyName' }],
  ['Your Second VPC Human Friendly Name', { VpcId: 'vpc-XYZWHATEVER2', File: 'SecondFriendlyName' }]
]);


const ASQ = require('asynquence-contrib');
const lib = require('./lib.js');
const GV_PATH = lib.GV_PATH;
const SVG_PATH = lib.SVG_PATH;
const HTML_PATH = lib.HTML_PATH;

const consolidateSimpleSGgraphLabels = lib.consolidateSimpleSGgraphLabels;
const getEC2info = lib.getEC2info;
const getRDSinfo = lib.getRDSinfo;
const getSGinfo = lib.getSGinfo;
const makeEC2digraphAdder = lib.makeEC2digraphAdder;
const makeGraphTranslator = lib.makeGraphTranslator;
const makeGraphVizString = lib.makeGraphVizString;
const makeGV2SVGtranslator = lib.makeGV2SVGtranslator;
const makeFileWriter = lib.makeFileWriter;
const makeRDSdigraphAdder = lib.makeRDSdigraphAdder;
const makeSimpleSGgraph = lib.makeSimpleSGgraph;

var makeGraphViz = function(params){
  ASQ(params)
  .then(
    getSGinfo,
    getEC2info,
    getRDSinfo,
    makeSimpleSGgraph,
    consolidateSimpleSGgraphLabels,
    makeGraphTranslator('ConsolidatedSGdigraph', 'IdDictionary'),
    (done, params) => {
      params.sglayers = {
        layers: ['rds instance', 'ec2 instance', 'personal', 'institution ip', 'service'],
        colors: {
          'rds instance': 'blue',
          'ec2 instance': 'red',
          'personal': 'green',
          'institution ip': 'yellow',
          'service': 'pink'
        },
        vert2layer: params.TypeDictionary,
        excludes: { 'TC Support SG': 'TC Support SG' }
      };
      done(params);
    },
    makeEC2digraphAdder('EC2instances', 'sglayers', 'PlusEC2', 'ConsolidatedSGdigraphIdDictionary'),
    makeRDSdigraphAdder('RDSinstances', 'sglayers', 'PlusEC2plusRDS', 'PlusEC2'),
    makeGraphVizString('layeredSourceTypes', 'PlusEC2plusRDS', 'RDS_EC2_Layered_Graph', 'sglayers'),
    makeFileWriter('PlusEC2plusRDS.gv', params.File),
    makeGV2SVGtranslator(params.File, true)
  );
};

for (let [vpcName, asqParams] of vpcsToAnalyze) {
  console.log(`CREATING GraphViz Analysis of ${vpcName}`);
  makeGraphViz(asqParams);
}
console.log(`Find the latest HTML files created with "ls ${HTML_PATH}"
Find the archived SVG files with "ls -ltr ${SVG_PATH}"
Find the archived GraphViz files with "ls -ltr ${GV_PATH}"`);
