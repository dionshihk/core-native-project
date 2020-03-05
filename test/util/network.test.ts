import {urlParams, uri, queryString} from "../../src/util/network";

test("urlParams", () => {
    expect(urlParams("/user", {})).toEqual("/user");
    expect(urlParams("/user/:id", {id: 1})).toEqual("/user/1");
    expect(urlParams("/user/:userId/item/:itemId", {userId: "1", itemId: "2"})).toEqual("/user/1/item/2");
});

test("uri", () => {
    const date = new Date(Date.UTC(2018, 11, 24, 10, 33, 30, 0)); // 2018 Dec 24, 10:33:30
    expect(uri("/user", {})).toEqual("/user");
    expect(uri("/user", {id: 1})).toEqual("/user?id=1");
    expect(uri("/user", {id: 1, name: "test"})).toEqual("/user?id=1&name=test");
    expect(uri("/user", {id: 1, name: "A&B"})).toEqual("/user?id=1&name=A%26B");
    expect(uri("/user", {id: 1, name: "test", date})).toEqual("/user?id=1&name=test&date=2018-12-24T10:33:30.000Z");
});

test("queryString", () => {
    const date = new Date(Date.UTC(2018, 4, 2)); // May 2, 2018

    expect(queryString(null)).toEqual("");
    expect(queryString(undefined)).toEqual("");
    expect(queryString({})).toEqual("");
    expect(queryString({id: 1, name: "Tom"})).toEqual("?id=1&name=Tom");
    expect(queryString({id: 1, name: "="})).toEqual("?id=1&name=%3D");
    expect(queryString({date})).toEqual("?date=2018-05-02T00:00:00.000Z");
    expect(queryString({id: null, name: "Tom"})).toEqual("?name=Tom");
});
