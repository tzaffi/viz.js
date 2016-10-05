var ASQ = require('asynquence-contrib');

var AWS = require('aws-sdk');
AWS.config.loadFromPath('./config.json');

var ec2 = new AWS.EC2();

var object2array = function(obj){
  var arr = [];
  Object.keys(obj).map(key => arr.push([key, obj[key]]));
  return arr;
}

var object2simpleGraphvizDigraph = function(obj){
  var edges = "";
  Object.keys(obj).map(key => {
    var inEdges = obj[key];
    inEdges.map(vert => {
      edges += `
      "${vert[0]}" -> "${key}" [label="${vert[1]}"];`;
    });
  });
  return `digraph G {
    ${edges}
  }`;
}


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
  done(digraph);
}

var consolidateSimpleSGgraphLabels = function(done, digraph){
  var consolidate = {};
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
    consolidate[sgKey] = object2array(verts);
  });
  done(consolidate);
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
  (done, digraph) => {
    var gv = object2simpleGraphvizDigraph(digraph);
    console.log("\n__________________\nConsolidatedDigraph\n__________________\n",
                gv);
    done(gv);
  }
    
);
