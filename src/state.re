open Lwt.Infix;

type t = {ht: Hashtbl.t(string, Ezjsonm.t)};

let create = () => {ht: Hashtbl.create(~random=false, 10)};

let get_keys = (ctx) => Hashtbl.fold((k, v, acc) => [k, ...acc], ctx.ht, []);

let exists = (ctx, id) => Hashtbl.mem(ctx.ht, id);

let add = (ctx, id, q) => Hashtbl.replace(ctx.ht, id, q);

let remove = (ctx, id) => Hashtbl.remove(ctx.ht, id);

let replace = (ctx, id, q) => Hashtbl.replace(ctx.ht, id, q);

let get = (ctx, id) => Hashtbl.find(ctx.ht, id);