require! { express, 'body-parser' }

app = express!

#app.enable 'trust proxy'

#app.use express.static 'static'

app.use body-parser.urlencoded extended: false

app.get '/twitter/api/*' (req, res) !->
  err, results <-! twitter.fetch req.params[0], req.body
  if err
    res.write-head 400
    err |> JSON.stringify |> res.end
    return
  res.header 'Access-Control-Allow-Origin': \*
  results |> JSON.stringify |> res.end

app.get '/twitter/is-signed-in' (req, res) !->
  res.header 'Access-Control-Allow-Origin': \*
  res.end '' + twitter.is-signed-in!

app.post '/400' (req, res) !->
  res.write-head 400
  res.end!

app.listen 7999
