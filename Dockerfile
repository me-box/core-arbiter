FROM jptmoore/arbiter:v0.0.3

EXPOSE 4444
EXPOSE 4445

RUN addgroup -S databox && adduser -S -g databox databox
USER databox

#CMD ["/app/zest/server.exe","--databox", "--request-endpoint=tcp://0.0.0.0:4444"]
CMD ["/app/zest/server.exe","--databox", "--request-endpoint=tcp://0.0.0.0:4444", "--enable-logging"]
#CMD ["/app/zest/server.exe","--secret-key-file=/run/secrets/ZMQ_SECRET_KEY", "--token-key-file=/run/secrets/CM_KEY", "--enable-logging"]