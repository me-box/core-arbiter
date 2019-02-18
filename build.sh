#! /bin/sh

# compile code
echo "compiling..."
eval `opam config env`
cd src && jbuilder build server.exe
cp base-cat.json ../
cp example-server-key ../
cp example-token-key ../
cp ./_build/default/server.exe ../
echo "done compiling"
