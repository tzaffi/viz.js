# Installation (with Docker)
You'll need to have the Docker engine including `docker-compose` on your system.

## Clone this repo and build the Docker image
```
git clone https://github.com/tzaffi/viz.js/
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
