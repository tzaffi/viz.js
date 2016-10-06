var ASQ = require('asynquence-contrib');

var AWS = require('aws-sdk');
AWS.config.loadFromPath('./config.json');

var ec2 = new AWS.EC2();

/************ HELPERS ***********/
var object2array = function(obj){
  var arr = [];
  Object.keys(obj).map(key => arr.push([key, obj[key]]));
  return arr;
}

var isIpAddress = function(addr){
  var threeDots = /([.][^.]+){3}/;
  return addr.match(threeDots) ? true : false;
}

var isSgAddress = function(addr){
  var sgMatcher = /^sg-/;
  return addr.match(sgMatcher) ? true : false;
}

/******************* GraphViz String Generators *********************/

var object2simpleGraphvizDigraph = function(obj, graphName = 'G'){
  var edges = "";
  Object.keys(obj).map(key => {
    var inEdges = obj[key];
    inEdges.map(vert => {
      edges += `
      "${vert[0]}" -> "${key}" [label="${vert[1]}"];`;
    });
  });
  return `digraph ${graphName} {
    ${edges}
  }`;
}

/* Separate by ip and security group */
var objectG2raphvizDigraphSeparatedBySourceType = function(obj, graphName = 'G'){
  var edges = "";
  var ips = {};
  var sgs = {};

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

  ipStr = "";
  Object.keys(ips).map(ip => ipStr += ('"' + ip + '";\n'));

  sgStr = "";
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
    
  return `digraph ${graphName} {

    ${sgSubgraph}

    ${ipSubgraph}
    
    ${edges}
  }`;
}

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


var getSGinfo = function(done){

  var getSGtag = function(sgObj, tagName){
    var tagVal = sgObj.Tags.find(tag => {
      return tag.Key === tagName;
    });
    if(tagVal)
      return tagVal.Value;
    return null;
  }

  var SecurityGroups = {};
  var IdDictionary = {};
  var prepareSGdigraph = function(data){
    data.SecurityGroups.forEach(function(val, idx) {
      var obj = {}
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
    });
    done(SecurityGroups, IdDictionary);
  }

  var params = {
    DryRun: false,
    // Filters: [
    //   {
    //     Name: 'vpc-id',
    //     Values: [
    //       'vpc-79fa251c'
    //     ]
    //   }
    // ]
  };

  ec2.describeSecurityGroups(params, function(err, data) {
    if (err) {
      console.log(err, err.stack);
      done.fail(err);
    } else {
      prepareSGdigraph(data, console.log);
    }
  });
}

var makeSimpleSGgraph = function(done, SecurityGroups, IdDictionary, vpcID){
  var digraph = {};
  SecurityGroups[vpcID].map(sg => {
    digraph[sg.GroupId] = sg.InEdges;
  });
  if(done){
    done(digraph);
  } else {
    return digraph;
  }
}

var consolidateSimpleSGgraphLabels = function(done, digraph){
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
  if(done){
    done(digraph, consolidated);
  } else {
    return {digraph: digraph, consolidated: consolidated};
  }
}

var makeEdLabSGgraph = function(done, SecurityGroups, IdDictionary, vpcID){
  var simpleDigraph = makeSimpleSGgraph(null, SecurityGroups, IdDictionary, vpcID);  
  var digraphs = consolidatedSimpleSGgraphLabels(null, simpleDigraph);
  var digraph = digraphs.consolidated;
  done(SecurityGroups, IdDictionary, digraph);
}

ASQ(
  getSGinfo,
  (done, SecurityGroups, IdDictionary) => {
    console.log("\n__________________\nSecurityGroups:\n__________________\n",
                JSON.stringify(SecurityGroups, null, 2));
    console.log("\n__________________\nIdDictionary\n__________________\n",
                IdDictionary);
    done(SecurityGroups, IdDictionary, 'vpc-76d49213');
  },
  makeSimpleSGgraph,
  (done, digraph) => {
    console.log("\n__________________\nSimpleDigraph\n__________________\n",
                digraph);
    done(digraph);
  },
  consolidateSimpleSGgraphLabels,
  (done, digraph, consolidated) => {
    var gv = object2simpleGraphvizDigraph(consolidated, 'SimpleGraph');
    console.log("\n__________________\nConsolidatedDigraph\n__________________\n",
                gv);
    done(digraph, consolidated, gv);
  },
  (done, digraph, consolidated) => {
    var gv = objectG2raphvizDigraphSeparatedBySourceType(consolidated, 'SeparatedGraph');
    console.log("\n__________________\nSeperatedBySourceTypeDigraph\n__________________\n",
                gv);
    done(consolidated, gv);
  }    
);
