# sudo apt-get install nodejs npm
# sudo ln -s /usr/bin/nodejs /usr/bin/node
# npm-install grunt-browserify
# sudo npm install -g grunt-cli
# sudo npm install -g grunt-cli
# sudo npm install -g mocha
grunt

xvfb-run google-chrome --pack-extension=./deploy/ --pack-extension-key=./chrome-arduino-extension.pem --enable-experimental-extension-apis

mv -f deploy.crx extension.crx
