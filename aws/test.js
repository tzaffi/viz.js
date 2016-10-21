const ASQ = require('asynquence-contrib');
const lib = require('./lib.js');

const consolidateSimpleSGgraphLabels = lib.consolidateSimpleSGgraphLabels;
const getEC2info = lib.getEC2info;
const getRDSinfo = lib.getRDSinfo;
const getSGinfo = lib.getSGinfo;
const makeEC2digraphAdder = lib.makeEC2digraphAdder;
const makeGraphTranslator = lib.makeGraphTranslator;
const makeGraphVizString = lib.makeGraphVizString;
const makePrinter = lib.makePrinter;
const makeRDSdigraphAdder = lib.makeRDSdigraphAdder;
const makeSimpleSGgraph = lib.makeSimpleSGgraph;

var testFlow = function(params){
  ASQ(params)
  .then(
    getSGinfo,
    getEC2info,
    getRDSinfo,
    makePrinter('RDSinstances'),
    makePrinter('EC2instances'),
    makePrinter('SecurityGroups'),
    makePrinter('IdDictionary'),
    makeSimpleSGgraph,
    makePrinter('SimpleSGdigraph'),
    makeGraphVizString('simpleDigraph', 'SimpleSGdigraph', 'Simple_Graph'),
    makePrinter('SimpleSGdigraph.gv', false),
    consolidateSimpleSGgraphLabels,
    makeGraphVizString('simpleDigraph', 'ConsolidatedSGdigraph', 'Consolidated_Graph'),
    makePrinter('ConsolidatedSGdigraph.gv', false),
    makeGraphVizString('separateSourceTypes', 'ConsolidatedSGdigraph', 'Separated_Graph'),
    makePrinter('ConsolidatedSGdigraph.gv', false),
    makeGraphTranslator('ConsolidatedSGdigraph', 'IdDictionary'),
    makePrinter('ConsolidatedSGdigraphIdDictionary'),
    makeGraphVizString('separateSourceTypes', 'ConsolidatedSGdigraphIdDictionary', 'Named_Separated_Graph'),
    makePrinter('ConsolidatedSGdigraphIdDictionary.gv', false),
    makePrinter('TypeDictionary'),
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
    makeGraphVizString('layeredSourceTypes', 'ConsolidatedSGdigraphIdDictionary', 'Layered_Graph', 'sglayers'),
    makePrinter('ConsolidatedSGdigraphIdDictionary.gv', false),
    makeEC2digraphAdder('EC2instances', 'sglayers', 'PlusEC2', 'ConsolidatedSGdigraphIdDictionary'),
    makePrinter('PlusEC2', true),
    makeGraphVizString('layeredSourceTypes', 'PlusEC2', 'EC2_Layered_Graph', 'sglayers'),
    makePrinter('PlusEC2.gv', false),
    makeRDSdigraphAdder('RDSinstances', 'sglayers', 'PlusEC2plusRDS', 'PlusEC2'),
    makePrinter('PlusEC2plusRDS', true),
    makeGraphVizString('layeredSourceTypes', 'PlusEC2plusRDS', 'RDS_EC2_Layered_Graph', 'sglayers'),
    makePrinter('PlusEC2plusRDS.gv', false)
  );
};

var asqParams = { VpcId: 'vpc-76d49213' }; //Library Apps
asqParams = { VpcId: 'vpc-79fa251c' };     //EdLab Apps
testFlow(asqParams);
