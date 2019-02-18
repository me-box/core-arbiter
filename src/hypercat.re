open Lwt.Infix;
open Ezjsonm;

let tcp_port = "5555";

type t = {mutable cat: Ezjsonm.t};
  
let create = () => {
  cat: from_channel(open_in("base-cat.json"))
};

let get = (ctx) => {
  ctx.cat;
};


let make_href = (name, port) => {
  Printf.sprintf("tcp://%s:%s", name, port);
};

let make_item = (name) => {
  let href = make_href(name, tcp_port);
  `O([ 
    ("href", string(href)),
    ("item-metadata", 
      `A([
          `O([
            ("rel", string("urn:X-hypercat:rels:hasDescription:en")), 
            ("val", string(href))]), 
          `O([
            ("rel", string("urn:X-hypercat:rels:isContentType")), 
            ("val", string("application/vnd.hypercat.catalogue+json"))])]))])
};

let remove_item_worker = (json, href) => {
  let href' = get_string(find(json, ["href"])); 
  href != href';
};

let remove_item = (name, lis) => {
  let href = make_href(name, tcp_port);
  List.filter((x) => remove_item_worker(x, href), lis);
};


let filter_lis = (ctx, name) => {
  let items = find(value(ctx.cat), ["items"]);
  let lis = get_list((x) => x, items);
  remove_item(name, lis);
};

let update_cat = (ctx, items) => {
  let cat = update((value(ctx.cat)), ["items"], Some(items));
  ctx.cat = `O(get_dict(cat));
};

let remove = (ctx, name) => {
  let lis = filter_lis(ctx, name);
  let items = list((x) => x, lis);
  update_cat(ctx, items);
};

let add = (ctx, name) => {
  let item = make_item(name);
  let lis = filter_lis(ctx, name);
  let lis' = List.append(lis, [item]);
  let items = list((x) => x, lis');
  update_cat(ctx, items);
};


