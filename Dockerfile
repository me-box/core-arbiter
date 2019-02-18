FROM ocaml/opam:alpine_ocaml-4.04.2

# add the code
ADD src src
RUN sudo chown -R opam:nogroup src

# add the build script
ADD build.sh .

# setup ocaml
RUN sudo apk update && sudo apk add alpine-sdk bash ncurses-dev m4 perl gmp-dev zlib-dev libsodium-dev opam zeromq-dev \
&& opam pin add -n sodium https://github.com/me-box/ocaml-sodium.git#with_auth_hmac256 \
&& opam install -y reason lwt tls sodium macaroons ezirmin bitstring ppx_bitstring uuidm lwt-zmq bos oml \
&& sudo chmod +x build.sh && sync \
&& ./build.sh \
&& rm -rf /home/opam/src \
&& rm -rf /home/opam/.opam \
&& rm -rf /home/opam/opam-repository

FROM alpine:3.6

USER root
WORKDIR /app/zest/

COPY --from=0 /home/opam/ .
# runtime dependencies
RUN apk update && apk upgrade \
&& apk add libsodium gmp zlib libzmq

EXPOSE 5555
EXPOSE 5556

