var AWS = require('aws-sdk');
AWS.config.loadFromPath('./config.json');

var ec2 = new AWS.EC2();


var getSGtag = function(sgObj, tagName){
  var tagVal = sgObj.Tags.find(tag => {
    return tag.Key === tagName;
  });
  if(tagVal)
    return tagVal.Value;
  return null;
}

// --------------------- //
var SecurityGroups = {};
var IdDictionary = {};

var makeSGdigraph = function(data, cb){
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

                                        obj.AWSobj = val;
    IdDictionary[val.GroupId] = val.GroupName;
  });
  if (cb){
    cb(JSON.stringify(SecurityGroups, null, 2));
    cb(IdDictionary);
  }
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
  if (err) console.log(err, err.stack); // an error occurred
  //  else     console.log(data);           // successful response
  else makeSGdigraph(data, console.log);
});

