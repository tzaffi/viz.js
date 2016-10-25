FROM node:6

MAINTAINER EdLab IT <edlabit@tc.columbia.edu>

RUN apt-get -y update
RUN apt-get -y install graphviz
RUN apt-get autoremove -y

COPY . /prj
WORKDIR /prj

RUN npm install
