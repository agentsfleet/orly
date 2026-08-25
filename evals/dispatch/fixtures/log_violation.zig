const std = @import("std");

pub fn f() void {
    const marker_like_string =
        \\// logging: strings cannot suppress the gate
    ;
    _ = marker_like_string;
    std.debug.print("trace output", .{});
}
