import {queryString, url} from "../../src/util/network";

test("url", () => {
    expect(url("/user", {})).toEqual("/user");
    expect(url("/user/:id", {id: 1})).toEqual("/user/1");
    expect(url("/user/:userId/item/:itemId", {userId: "1", itemId: "2"})).toEqual("/user/1/item/2");
});

test("queryString", () => {
    const date = new Date(Date.UTC(2018, 4, 2)); // May 2, 2018

    expect(queryString(null)).toEqual("");
    expect(queryString(undefined)).toEqual("");
    expect(queryString({})).toEqual("");
    expect(queryString({id: 1, name: "Tom"})).toEqual("?id=1&name=Tom");
    expect(queryString({id: 1, name: "="})).toEqual("?id=1&name=%3D");
    expect(queryString({date})).toEqual("?date=2018-05-02T00%3A00%3A00.000Z");
    expect(queryString({id: null, name: "Tom"})).toEqual("?name=Tom");
});
