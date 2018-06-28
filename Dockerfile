FROM jptmoore/arbiter

EXPOSE 4444
EXPOSE 4445

CMD ["/app/zest/server.exe","--databox", "--request-endpoint=tcp://0.0.0.0:4444", "--enable-logging"]
#CMD ["/app/zest/server.exe","--secret-key-file=/run/secrets/ZMQ_SECRET_KEY", "--token-key-file=/run/secrets/CM_KEY", "--enable-logging"]