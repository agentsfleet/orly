const value: u8 = 1;

pub fn report() void {
    // logging: stdout is this command's answer, not a log record
    std.debug.print("{d}\n", .{value});
}
