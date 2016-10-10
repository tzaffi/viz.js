var ASQ = require('asynquence-contrib');

var AWS = require('aws-sdk');
AWS.config.loadFromPath('./config.json');

var ec2 = new AWS.EC2();

/************ HELPERS ***********/
var object2array = function(obj){
  var arr = [];
  Object.keys(obj).map(key => arr.push([key, obj[key]]));
  return arr;
};

var isIpAddress = function(addr){
  var threeDots = /([.][^.]+){3}/;
  return addr.match(threeDots) ? true : false;
};

var isSgAddress = function(addr){
  var sgMatcher = /^sg-/;
  return addr.match(sgMatcher) ? true : false;
};


/* Separate by ip and security group */
// var objectG2raphvizDigraphSeparatedBySourceType = function(obj, graphName = 'G'){
//   var edges = "";
//   var ips = {};
//   var sgs = {};

//   Object.keys(obj).map(key => {
//     var inEdges = obj[key];
//     inEdges.map(vert => {
//       edges += `
//       "${vert[0]}" -> "${key}" [label="${vert[1]}"];`;
     
//       if(isIpAddress(vert[0])) {
//         ips[vert[0]] = vert[0];
//       }
//       else if(isSgAddress(vert[0])) {
//         sgs[vert[0]] = vert[0];
//       }
//       if(isIpAddress(key)) {
//         ips[key] = key;
//       }
//       else if(isSgAddress(key)) {
//         sgs[key] = key;
//       }      
//     });
//   });

//   var ipStr = "";
//   Object.keys(ips).map(ip => ipStr += ('"' + ip + '";\n'));

//   var sgStr = "";
//   Object.keys(sgs).map(sg => sgStr += ('"' + sg + '";\n'));
                       
//   var sgSubgraph = `subgraph cluster_0 {    
//     label = "Security Groups";
//     color=blue;
//     node [style=filled];
//     ${sgStr}
//   }`;

//   var ipSubgraph = `subgraph cluster_1 {
//     label = "IP Addresses";
//     style=filled;
//     color=lightgrey;
//     node [style=filled,color=white];
//     ${ipStr}
//   }`;
    
//   return `digraph ${graphName} {

//     ${sgSubgraph}

//     ${ipSubgraph}
    
//     ${edges}
//   }`;
// }


/******************* Asqx functions 
 * To make it a little easier to program and plug and play, 
 * we specify some conventions for how Asynquence-compatible
 * functions should be declared and writted:
 *
 * Parameters - There should be exactly 2:
 *    o- done - the ASQ callback object
 *    o- params - an object that aggregates both the input and result
 *
 * If done DNE, the function should simply return the params object
 * If params DNE, the function should create it as an object
 *
 * Output - as above there are two possibilities
 *    o- done DNE - in which case we call `return params`
 *    o- done exists - in which case we call `done(params)`
 *
 * Expected values - each function should specify it its comments which
 *   values are required to be available inside of the params object.
 *   If the expected values are not found, then an exception should be generated
 *   that comports with whether or not done is available:
 *     o- done DNE - throw an exception
 *     o- done exists - call done.fail()
 *
 * Return values - each function should specify in its comments which
 *   values will be returned inside of the params object. 
 *    o- no value out will return in no additional value being added to params
 *    o- by convention, the key given to params will be the same as the variable name
 * 
 * EXAMPLE:
// Expected params: val
// Output params: valx2, valx3
var doublerAndTripler = function(done, params){
  // TOP BOILER-PLATE:
  if(!params) params = {};
  if(!params.val){
    if(done){
      done.fail('val is missing from params');
    } else {
      throw 'val is missing from params';
    }
  } 
 
  // THE CUSTOM CODE:
  params.valx2 = 2*params.val;
  params.valx3 = 3*params.val;

  // BOTTOM BOILER-PLATE:
  if(done){
    done(params);
  } else {
    return params;
  }
}
*********************/

// Create an asq compatible printer that prints a particular part of params
// with given print options:
var makePrinter = function(tagToPrint, useJSONstringify = true){
  // Expected params: * params[tagToPrint] - this should exist
  // Output params:   * none are added. This is purely a side-effect function
  return function printer(done, params){
    var printObj = params[tagToPrint];
    if(useJSONstringify) {
      printObj = JSON.stringify(printObj, null, 2);
    }
    console.log(`
________________________________________________________________________
${tagToPrint}:
________________________________________________________________________
${printObj}`);
    done(params);
  };
};


/******************* GraphViz String Generators
 * o- printerType - one of 'simpleDigraph', 'separateSourceTypes'
 * o- tagToPrint - the params key to use, i.e. params[tagToPrint]
 * o- graphName - the name to give the graph in the graphViz definition
 *********************/
var makeGraphVizString = function(printerType, tagToPrint, graphName = 'G') {
  var functionCatalog = {
    // Expected params: * params[tagToPrint] - this should exist
    // Output params:   * params[tagToPrint + '.gv'] - a GraphViz string ready to print
    simpleDigraph: function(done, params){
      var edges = '';
      var obj = params[tagToPrint];
      Object.keys(obj).map(key => {
        var inEdges = obj[key];
        inEdges.map(vert => {
          edges += `
          "${vert[0]}" -> "${key}" [label="${vert[1]}"];`;
        });
      });
      params[tagToPrint + '.gv'] =  `digraph ${graphName} {
        ${edges}
      }`;
      if(done){
        return done(params);
      } else {
        return params;
      }
    },
    separateSourceTypes: function(done, params){
      var edges = '';
      var ips = {};
      var sgs = {};
      var obj = params[tagToPrint];
      
      Object.keys(obj).map(key => {
        var inEdges = obj[key];
        inEdges.map(vert => {
          edges += `
          "${vert[0]}" -> "${key}" [label="${vert[1]}"];`;
          
          if(isIpAddress(vert[0])) {
            ips[vert[0]] = vert[0];
          }
          else if(isSgAddress(vert[0])) {
            sgs[vert[0]] = vert[0];
          }
          if(isIpAddress(key)) {
            ips[key] = key;
          }
          else if(isSgAddress(key)) {
            sgs[key] = key;
          }      
        });
      });
      
      var ipStr = '';
      Object.keys(ips).map(ip => ipStr += ('"' + ip + '";\n'));
      
      var sgStr = '';
      Object.keys(sgs).map(sg => sgStr += ('"' + sg + '";\n'));
      
      var sgSubgraph = `subgraph cluster_0 {    
        label = "Security Groups";
        color=blue;
        node [style=filled];
        ${sgStr}
      }`;
      
      var ipSubgraph = `subgraph cluster_1 {
        label = "IP Addresses";
        style=filled;
        color=lightgrey;
        node [style=filled,color=white];
        ${ipStr}
      }`;
      
      params[tagToPrint + '.gv'] = `digraph ${graphName} {
        
        ${sgSubgraph}
        
        ${ipSubgraph}
        
        ${edges}
      }`;
      if(done){
        return done(params);
      } else {
        return params;
      }
    }
  };
  return functionCatalog[printerType];
};

// Query the Security Groups from AWS and store in an object.
// If no 
// is formatted as expected. Can also be used a basis for making more complex and
// informative di-graphs.
// Allow for non-ASQ usage by returning params in the case that done is undefined.
// Expected params: * params.VpcId - the vpcId: if null take all VPC's
// Output params:   * params.SecurityGroups - SecurityGroup information formatted for easier graph writing
//                  * params.IdDictionary - the security group -> group name mapping
//                  * params.TypeDictionary - the security group -> Type mapping
var getSGinfo = function(done, params){
  var awsParams = {
    DryRun: false
  };
  
  if (!params.VpcId){
    params.VpcId = null;
  } else {
    awsParams.Filters =  [
      {
        Name: 'vpc-id',
        Values: [ params.VpcId ]
      }
    ];
  }

  var getSGtag = function(sgObj, tagName){
    var tagVal = sgObj.Tags.find(tag => {
      return tag.Key === tagName;
    });
    if(tagVal)
      return tagVal.Value;
    return null;
  };

  var SecurityGroups = {};
  var IdDictionary = {};
  var TypeDictionary = {};
  var prepareSGdigraph = function(data){
    data.SecurityGroups.forEach(function(val) {
      var obj = {};
      if(SecurityGroups[val.VpcId]){
        SecurityGroups[val.VpcId].push(obj);
      } else {
        SecurityGroups[val.VpcId] = [obj];
      }

      obj.VpcId = val.VpcId;
      obj.GroupName =  val.GroupName;
      obj.GroupId =  val.GroupId;
      obj.Name = getSGtag(val, 'Name');
      obj.Type = getSGtag(val, 'Type');
      obj.InEdges = val.IpPermissions.map(edge => { 
        return [ (edge.IpRanges.length === 0 ?
                  edge.UserIdGroupPairs.map(u => u.GroupId) :
                  edge.IpRanges.map(u => u.CidrIp) ),
                 edge.ToPort
               ];
      });
      var inEdges = [];
      obj.InEdges.forEach(complexEdge => {
        complexEdge[0].forEach(source => {
          inEdges.push([source, complexEdge[1]]);
        });
      });
      obj.InEdges = inEdges;
      
      obj.AWSobj = val;
      IdDictionary[val.GroupId] = val.GroupName;
      TypeDictionary[val.GroupId] = obj.Type;
    });
    params.SecurityGroups = SecurityGroups;
    params.IdDictionary = IdDictionary;
    params.TypeDictionary = TypeDictionary;
    done(params);
  };

  ec2.describeSecurityGroups(awsParams, function(err, data) {
    if (err) {
      console.log(err, err.stack);
      done.fail(err);
    } else {
      prepareSGdigraph(data, console.log);
    }
  });
};

// Create a simple di-graph which serves as a test that the Security Group information
// is formatted as expected. Can also be used a basis for making more complex and
// informative di-graphs.
// Allow for non-ASQ usage by returning params in the case that done is undefined.
// Expected params: * params.SecurityGroups - SecurityGroup information formatted for easier graph writing
//                  * params.VpcId - the vpcId to key off in params.SecurityGroups
// Output params:   * params.SimpleSGdigraph - a simple di-graph for the Security Groups of the given VPC
var makeSimpleSGgraph = function(done, params){
  var SecurityGroups = params.SecurityGroups;
  var vpcID = params.VpcId;
  var digraph = {};
  SecurityGroups[vpcID].map(sg => {
    digraph[sg.GroupId] = sg.InEdges;
  });
  params.SimpleSGdigraph = digraph;
  if(done){
    done(params);
  } else {
    return params;
  }
};

// Expected params: * params.SimpleSGdigraph - a simple di-graph for the Security Groups of the given VPC
// Output params:   * params.ConsolidatedSGdigraph - a version of the input where multiple edges are denoted by a single edge with multiple labels
var consolidateSimpleSGgraphLabels = function(done, params){
  var digraph = params.SimpleSGdigraph;
  var consolidated = {};
  Object.keys(digraph).map(sgKey => {
    var originalEdges = digraph[sgKey];
    var verts = {};
    originalEdges.map(edge => {
      var vert = edge[0];
      var port = (edge[1] ? ('' + edge[1] ) : 'ALL');
      if (verts[vert]) {
        verts[vert] = verts[vert] + ', ' + port;
      } else {
        verts[vert] = port;
      }
    });
    consolidated[sgKey] = object2array(verts);
  });
  params.ConsolidatedSGdigraph = consolidated;
  if(done){
    done(params);
  } else {
    return params;
  }
};

// Make a translator that takes a digraph and changes all nodes using the tagged dictionary
// o- digraphTag gives the location of the digraph to translate in params
// o- dictionalyTag gives the location of the dictionary to tranlate with
var makeGraphTranslator = function(digraphTag, dictionaryTag){
  // Expected params: * params[digraphTag] - the digraph
  //                  * params[dictionaryTag] - the dictionary to translate with
  // Output params:   * params[digraphTag + dictionaryTag] - the translated graph
  return function translate(done, params){
    var digraph = params[digraphTag];
    var dictionary = params[dictionaryTag];
    var translator = sgId => (dictionary[sgId] ? dictionary[sgId] : sgId);
    
    var translated = {};
    Object.keys(digraph).map(sgKey => {      
      var originalEdges = digraph[sgKey];
      var translatedEdges = [];
      originalEdges.map(edge => {
        var translatedEdge = [ translator(edge[0]), edge[1] ];
        translatedEdges.push(translatedEdge);
      });
      translated[translator(sgKey)] = translatedEdges;
    });
    params[digraphTag + dictionaryTag] = translated;
    done(params);
  };
};

var asqParams = { VpcId: 'vpc-76d49213' };
ASQ(asqParams)
  .then(
    getSGinfo,
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
    makePrinter('TypeDictionary')
  );

