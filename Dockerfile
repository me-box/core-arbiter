FROM node:argon

ADD package.json package.json
RUN npm install
ADD . .

EXPOSE 7999

CMD ["npm","start"]
