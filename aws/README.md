# What does this project do?

### GIVEN: AWS VPC
### Create a visual graph that shows
* All the Security Groups within that VPC
* All the EC2 boxes within that VPC
* All the RDS instances withing that VPC
* Allowed network flow in your VPC. There is a...
   *  ***BIG ASSUMPTION***: That every EC2 box in your VPC has outbound Security Group type with label which has a key `type` and value `ec2 instance` and that his security group is used to connect out of the box to more secure systems such as RDS'es.
       * This is a big assumption because their graph edges are drawn *in the opposite* direction for such Security Groups, as their
       point it to allow **outbound** connections rather than the typical inbound connections.
   * **OTHER ASSUMPTIONS**
       * You can install the `dot` command (i.e., the GraphViz CLI) on your system
       * Modify `analyzeSecurityGroups.js` (and the `vpcsToAnalyze` constant) to incorporate your specific VPC id's
       * Security Groups have a `Type` label with possible values `ec2 instance`, `rds instance`, 
`personal`, `institution ip`, and `service` which allow drawing the graph in a saner manner. If you look at `test.js`
you'll see versions of the graph drawer which don't make these assumptions. You can also modify `analyzeSecurityGroups.js` (near the bottom to get rid of this assumption, or modify it per your requirements).

# Clone this repo 
```
git clone https://github.com/tzaffi/viz.js
```

# Modify the source code
See the assumptions above. You'll need to make specific changes to `AnalyzeSecurityGroups.js` as well as `lib.js`
to work with your system.

# Installation (with Docker)
You'll need to have the Docker engine including `docker-compose` on your system.

and build the Docker image
```
cd viz.js/aws
docker-compose --verbose up -d --force-recreate --remove-orphans
```

## Running (with Docker)
```
cd viz.js/aws
docker-compose run awsanalyze node analyzeSecurityGroups.js
```

# Installation (without Docker)

## Make sure that GraphVix / dot is installed on your system. (Sorry only *nix systems are supported).
For example, on Ubuntu you install with
```
sudo apt-get install dot
```

## Clone this repo and install the require Node libraries
```
git clone https://github.com/tzaffi/viz.js/
cd viz.js/aws
npm install
```

# Running (without Docker)
```
cd viz.js/aws
node analyzeSecurityGroups.js
```

# Resulting Reports (with or without Docker)
This will generate reports:
* under `./reports` there are HTML pages that can be viewed in a browser (really just an SVG file - HTML5 compatible vector graphics file)
* under `./reports/archive/svg` and `./reports/archive/gv` archived, timestamped history of the GraphViz files (`gv`) and 
the generated SVG files (`svg`).

## Caveats

* Use at your own risk (though the worst that can happen is that no graph will be generated)
* This is designed for my workplace usage of Security Groups.  In particular, I assumed:
    * Very specific VPC id's
    * That there is a Security Group `Type` label and I assumed some specific values for this label
* I am intentionally not including `config.js` as I don't want to give away any credentials.
This is just your typical JSON file for AWS credentials.

# Some Random Links

* [Deprecated Project w/ baby png](http://mdaines.github.io/viz.js/)
* [More robust SVG generator](https://stamm-wilbrandt.de/GraphvizFiddle)
* [More robust SVG 2 GIF Converter](https://www.onlineconverter.com)
