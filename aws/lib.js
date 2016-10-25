var fs = require('fs');
var exec = require('child_process').exec;
var moment = require('moment');
var AWS = require('aws-sdk');
AWS.config.loadFromPath('./config.json');

var ec2 = new AWS.EC2();
var rds = new AWS.RDS();

const GV_PATH = './reports/archive/gv/';
const SVG_PATH = './reports/archive/svg/';
const HTML_PATH = './reports/';

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

var isEC2instance = function(addr){
  var startsWithEC2colon = /^EC2:/;
  return addr.match(startsWithEC2colon) ? true : false;
};

var isRDSinstance = function(addr){
  var startsWithRDScolon = /^RDS:/;
  return addr.match(startsWithRDScolon) ? true : false;
};

var isSgAddress = function(addr){
  var sgMatcher = /^sg-/;
  return addr.match(sgMatcher) ? true : false;
};

/******************* ASQ functions 
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

module.exports = {
  //constants:
  GV_PATH: GV_PATH,
  SVG_PATH: SVG_PATH,
  HTML_PATH: HTML_PATH,

  //Functions:
  
  // Create an asq compatible printer that prints a particular part of params
  // with given print options:
  makePrinter: function(tagToPrint, useJSONstringify = true, addHeader = true){
    // Expected params: * params[tagToPrint] - this should exist
    // Output params:   * none are added. This is purely a side-effect function
    return function printer(done, params){
      var printObj = params[tagToPrint];
      if(useJSONstringify) {
        printObj = JSON.stringify(printObj, null, 2);
      }
      var header = (addHeader ? `
                  ________________________________________________________________________
                  ${tagToPrint}:
                    ________________________________________________________________________
                    ` : '');
      console.log(`${header}${printObj}`);
      done(params);
    };
  },

  // Create an asq compatible file writer for a particular part of params
  // with given print options:
  makeFileWriter: function(tagToPrint, filePrefix, addTimeStamp = true, useJSONstringify = false, addHeader = false){
    // Expected params: * params[tagToPrint] - this should exist
    // Output params:   * params.gvFilesCreated : map from filePrefix --> actual file path
    var timeStamp = ( addTimeStamp ? ('_' + moment().format() ) : '' );
    var filePath = `${GV_PATH}${filePrefix}${timeStamp}.gv`;
    return function printer(done, params){
      var printObj = params[tagToPrint];
      if(useJSONstringify) {
        printObj = JSON.stringify(printObj, null, 2);
      }
      var header = (addHeader ? `
                  ________________________________________________________________________
                  ${tagToPrint}:
                    ________________________________________________________________________
                    ` : '');
      var strToWrite = `${header}${printObj}`;
      fs.writeFile(filePath, strToWrite, err => {
        if(err)
          done.fail(err);
        else {
          if( !params.gvFilesCreated )
            params.gvFilesCreated = {};
          params.gvFilesCreated[filePrefix] = filePath;
          done(params);
        }
      });
    };
  },

  // Create an asq compatible file translator (based on unix'es dot program)
  // which will convert GraphViz files to SVG vector files (saved as HTML and viewable with a browser)
  // if saveTReportsDir == true, save to HTML_PATH as well
  makeGV2SVGtranslator: function(filePrefix, saveToReportsDir = false){
    // Expected params: * params.gvFilesCreated[filePrefix] - which points to the actual .gv path
    // Output params:   * params.svgFilesCreated : map from filePrefix --> actual file path
    //                  * params.exec - which contains data for each command run
    return function printer(done, params){
      var gvFilePath = params.gvFilesCreated[filePrefix];
      var svgFilePath = `${SVG_PATH}${gvFilePath.split('/')[4].split('.')[0]}.html`;      
      var cmd = `dot -Tsvg ${gvFilePath} > ${svgFilePath}`;
      if (saveToReportsDir) {
        cmd += ` && dot -Tsvg ${gvFilePath} > ${HTML_PATH}${filePrefix}.html`;
      }
      exec(cmd, (error, stdout, stderr) => {
        if(error)
          done.fail(error);
        else {
          if( !params.exec )
            params.exec = {};
          params.exec[filePrefix] = {
            'cmd': cmd,
            'stdout': stdout,
            'stderr': stderr
          };
          done(params);
        }
      });
    };
  },


  /******************* GraphViz String Generators
   * o- printerType - one of 'simpleDigraph', 'separateSourceTypes'
   * o- tagToPrint - the params key to use, i.e. params[tagToPrint]
   * o- graphName - the name to give the graph in the graphViz definition
   * o- metadataTag - the optional name of the metadataTag
   *********************/
  makeGraphVizString: function(printerType, tagToPrint, graphName = 'G', metadataTag = null) {
    var functionCatalog = {
      // Expected params: * params[tagToPrint] - this should exist and is a digraph
      // Optional params: * params[metadataTag] 
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
      },
      layeredSourceTypes: function(done, params){
        //In addition to the usual vertices and edges in params[tagToPrint]
        //we also require params[metadataTag]
        //   for this graph type, we expect metadata = params[metadataTag] to be on object containing:
        //      * metadata.vert2layer - map: SG Group Name --> SG Type
        //      * metadata.layers - array: the ordered values in vert2layers to actually use in layering
        //      * metadata.colors - map: SG Type --> color
        //      * metadata.excludes: map: SG Group Name --> itself, of SG Groups NOT to layer
        const CATCHALL_LAYER = 'other';
        
        var edges = '';
        var ips = {};
        var ec2s = {};
        var rdses = {};
        var obj = params[tagToPrint];
        var metadata = params[metadataTag];
        var layers = metadata.layers;
        var colors = metadata.colors;
        if (!layers.find(x => x === CATCHALL_LAYER)) {
          layers.push(CATCHALL_LAYER);
          colors[CATCHALL_LAYER] = 'white';
        }
        var vert2layer = metadata.vert2layer;
        var excludes = metadata.excludes;
        
        var isLayer = layerStr => {
          for(let layer of layers) {
            if (layer === layerStr){
              return true;
            }
          }
          return false;
        };

        var layerObjs = {};
        for(let layer of layers){
          layerObjs[layer] = {};
        }

        var addVertexAndEdges = function(v){
          if(isIpAddress(v)) {
            ips[v] = v;
          } else if(isEC2instance(v)) {
            ec2s[v] = v;
          } else if(isRDSinstance(v)) {
            rdses[v] = v;
          } else {
            let layer = vert2layer[v];
            if( excludes.hasOwnProperty(v) )
              layer = CATCHALL_LAYER;
            if( isLayer(layer) ){
              layerObjs[layer][v] = v;
            } else {
              layerObjs[CATCHALL_LAYER][v] = v;
            }
          }      
        };
        
        Object.keys(obj).map(key => {
          var inEdges = obj[key];
          inEdges.map(vert => {
            edges += `
            "${vert[0]}" -> "${key}" [label="${vert[1]}"];`;
            addVertexAndEdges(vert[0]);
            addVertexAndEdges(key);
          });
        });

        var layerStrs = {};
        layers.map(layer =>{
          let layerStr = '';
          Object.keys(layerObjs[layer]).map(sg => layerStr += ('"' + sg + '";\n'));
          layerStrs[layer] = layerStr;        
        });
        
        var ipStr = '';
        Object.keys(ips).map(ip => ipStr += ('"' + ip + '";\n'));

        var ec2str = '';
        Object.keys(ec2s).map(ec2 => ec2str += ('"' + ec2 + '";\n'));

        var rdsStr = '';
        Object.keys(rdses).map(rds => rdsStr += ('"' + rds + '";\n'));

        var clusterNumber = 0;

        var rdsSubgraph = `subgraph cluster_${clusterNumber} {
          label = "RDS Databases";
          style=filled;
          color=gray32;
          node [style=filled,color=pink];
          rank=same;
          ${clusterNumber};
          ${rdsStr}
        }`;
        clusterNumber++;

        var ec2subgraph = `subgraph cluster_${clusterNumber} {
          label = "EC2 Boxes";
          style=filled;
          color=cornsilk;
          node [style=filled,color=pink];
          rank=same;
          ${clusterNumber};
          ${ec2str}
        }`;
        clusterNumber++;

        var sgClusters = '';
        for(let layer of layers){
          let sgSubgraph = `subgraph cluster_${clusterNumber} {
            label = "Security Groups Type ${layer}";
            color=${colors[layer]};
            node [style=filled, fillcolor=${colors[layer]}];
            rank=same;
            ${clusterNumber};
            ${layerStrs[layer]}
          }`;
          clusterNumber++;
          sgClusters += '\n' + sgSubgraph;
        }
        
        var ipSubgraph = `subgraph cluster_${clusterNumber} {
          label = "IP Addresses";
          style=filled;
          color=lightgrey;
          node [style=filled,color=white];
          rank=same;
          ${clusterNumber};
          ${ipStr}
        }`;
        
        params[tagToPrint + '.gv'] = `digraph ${graphName} {
          graph [page="8.5,11",
                 size="8,10.5",
                 ranksep=1,
                 margin="0.25,0.25",
                 ratio="auto",
                 orientation="portrait" ];

          {
            /* impose the expected dependency order  */
            node [shape=plaintext, fontsize=16, style="invis"];
            edge [style="invis"];
            8 -> 7 -> 6 -> 5 -> 4 -> 3 -> 2 -> 1 -> 0;
          }      

          ${rdsSubgraph}
          
          ${ec2subgraph}

          ${sgClusters}
          
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
  },

  // Query the running EC2 instances from AWS and store in an object.
  //
  // Expected params: * params.VpcId - the vpcId: if null take all VPC's
  // Output params:   * params.EC2instances - EC2 instances for the given VPC
  getEC2info: function(done, params){
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
        },
        {
          Name: 'instance-state-name',
          Values: [ 'running' ]
        }
      ];
    }
    var flattenComplexAWSstructure = function(data){
      var reservations = data.Reservations;
      var instances = reservations
          .map( reservation => reservation.Instances )
          .reduce( (x,y) => x.concat(y) );
      
      params.EC2instances = instances;
      done(params);
    };
    
    ec2.describeInstances(awsParams, function(err, data) {
      if (err) {
        console.log(err, err.stack);
        done.fail(err);
      } else {
        flattenComplexAWSstructure(data);
      }
    });
  },



  // Query the RDS instances from AWS and store in an object.
  //
  // Expected params: * params.VpcId - the vpcId: if null take all VPC's
  // Output params:   * params.RDSinstances - RDS instances for the given VPC
  //
  // NOTE: if you filter by VPC ID, you will not get any of the old pre-VPC RDS instances.
  getRDSinfo: function(done, params){
    var flattenComplexAWSstructure = function(data){
      var instances = data.DBInstances;
      if(params.VpcId){
        instances = instances.filter(instance => instance.DBSubnetGroup && instance.DBSubnetGroup.VpcId === params.VpcId);
      }
      params.RDSinstances = instances;
      done(params);
    };
    
    var awsParams = {};
    rds.describeDBInstances(awsParams, function(err, data) {
      if (err) {
        console.log(err, err.stack);
        done.fail(err);
      } else {
        flattenComplexAWSstructure(data);      
      }
    });
  },

  // Add EC2 info to SG digraph. If no previous digraph is specified,
  // create new digraph WITHOUT exernal SG info.
  // Note, edges connecting getween <SG of type ec2 instance> and <EC2: box> are reversed
  // for clarity (as these types of SG's are used to connect OUT of the box)
  //
  // ec2InfoTag - params[ec2InfoTag] is the array that is expected to store the EC2 info
  // metadataTag - params[metadataTag] - in particular we need metadata.vert2layer so we can tell the type of our SG and reverse the edge
  // resultingDigraphTag - store the resulting digraph in params[resultingDigraphTag]
  // sgDigraphTag - params[sgDigraphTag] is the pre-existing digraph to add to. Defaults to null.
  makeEC2digraphAdder: function( ec2InfoTag, metadataTag, resultingDigraphTag, sgDigraphTag = null ){
    var getEC2instanceName = instance => instance.Tags.find(tagObj => tagObj.Key === 'Name').Value;

    // Expected params: * params[ec2InfoTag]
    //                  * params[metadataTag]
    //                  * params[sgDigraphTag] - if sgDigraphTag is not null
    // Output params:   * params[resultingDigraphTag] - the outputted digraph
    return function addEC2digraph(done, params){
      var resultingDigraph = (sgDigraphTag === null ? {} : params[sgDigraphTag]);
      var instances = params[ec2InfoTag];
      var vert2layer = params[metadataTag].vert2layer;
      
      instances.map( instance => {
        var name = getEC2instanceName(instance);
        var instanceKey = `EC2: ${name}`;
        
        instance.SecurityGroups.map(sg => {
          var fromEC2toSG = (vert2layer[sg.GroupName] === 'ec2 instance');
          if (fromEC2toSG) {
            if( !resultingDigraph[sg.GroupName] ){
              resultingDigraph[sg.GroupName] = [];
            }
            resultingDigraph[sg.GroupName].push([instanceKey, 'EC2']);
          } else {
            if( !resultingDigraph[instanceKey] ){
              resultingDigraph[instanceKey] = [];
            }
            resultingDigraph[instanceKey].push([sg.GroupName, 'EC2']);
          }
        });
        
      });

      params[resultingDigraphTag] = resultingDigraph;
      done(params);
    };
  },

  // Add RDS info to SG digraph. If no previous digraph is specified,
  // create new digraph WITHOUT exernal SG info.
  // Note, edges connecting getween <SG of type rds instance> and <RDS: box> are reversed
  // for clarity (as these types of SG's are used to connect OUT of the box)
  //
  // rdsInfoTag - params[rdsInfoTag] is the array that is expected to store the RDS info
  // metadataTag - params[metadataTag] - in particular we need metadata.vert2layer so we can tell the type of our SG and reverse the edge
  // resultingDigraphTag - store the resulting digraph in params[resultingDigraphTag]
  // sgDigraphTag - params[sgDigraphTag] is the pre-existing digraph to add to. Defaults to null.
  makeRDSdigraphAdder: function( rdsInfoTag, metadataTag, resultingDigraphTag, sgDigraphTag = null ){
    // Expected params: * params[rdsInfoTag]
    //                  * params[metadataTag]
    //                  * params[sgDigraphTag] - if sgDigraphTag is not null
    //                  * params.IdDictionary 
    // Output params:   * params[resultingDigraphTag] - the outputted digraph
    return function addRDSdigraph(done, params){
      var resultingDigraph = (sgDigraphTag === null ? {} : params[sgDigraphTag]);
      var instances = params[rdsInfoTag];
      var sgid2name = params.IdDictionary;
      
      instances.map( instance => {
        var name = instance.DBInstanceIdentifier;
        var instanceKey = `RDS: ${name}`;

        instance.VpcSecurityGroups.map(sg => {
          var sgName = sgid2name[sg.VpcSecurityGroupId];
          if( !resultingDigraph[instanceKey] ){
            resultingDigraph[instanceKey] = [];
          }
          resultingDigraph[instanceKey].push([sgName, 'RDS']);
        });
        
      });
      
      params[resultingDigraphTag] = resultingDigraph;
      done(params);
    };
  },

  // Query the Security Groups from AWS and store in an object.
  // If no 
  // is formatted as expected. Can also be used a basis for making more complex and
  // informative di-graphs.
  // Allow for non-ASQ usage by returning params in the case that done is undefined.
  // Expected params: * params.VpcId - the vpcId: if null take all VPC's
  // Output params:   * params.SecurityGroups - SecurityGroup information formatted for easier graph writing
  //                  * params.IdDictionary - the security group -> group name mapping
  //                  * params.TypeDictionary - the security group -> Type mapping
  getSGinfo: function(done, params){
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
        TypeDictionary[val.GroupName] = obj.Type;
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
        prepareSGdigraph(data);
      }
    });
  },

  // Create a simple di-graph which serves as a test that the Security Group information
  // is formatted as expected. Can also be used a basis for making more complex and
  // informative di-graphs.
  // Allow for non-ASQ usage by returning params in the case that done is undefined.
  // Expected params: * params.SecurityGroups - SecurityGroup information formatted for easier graph writing
  //                  * params.VpcId - the vpcId to key off in params.SecurityGroups
  // Output params:   * params.SimpleSGdigraph - a simple di-graph for the Security Groups of the given VPC
  makeSimpleSGgraph: function(done, params){
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
  },

  // Expected params: * params.SimpleSGdigraph - a simple di-graph for the Security Groups of the given VPC
  // Output params:   * params.ConsolidatedSGdigraph - a version of the input where multiple edges are denoted by a single edge with multiple labels
  consolidateSimpleSGgraphLabels: function(done, params){
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
  },

  // Make a translator that takes a digraph and changes all nodes using the tagged dictionary
  // o- digraphTag gives the location of the digraph to translate in params
  // o- dictionalyTag gives the location of the dictionary to tranlate with
  makeGraphTranslator: function(digraphTag, dictionaryTag){
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
  }
};
