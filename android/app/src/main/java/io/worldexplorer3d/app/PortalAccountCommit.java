package io.worldexplorer3d.app;

import java.util.function.BooleanSupplier;

/** SDK adoption cannot be interrupted safely. The command owner serializes
 * this whole operation, drains it and rolls it back before another command.
 * A durable marker makes process death fail closed on the next SDK opening. */
final class PortalAccountCommit<T> {
    interface Port<T> {
        T current();
        String uid(T user);
        void mark()throws Exception;
        void adopt(T user)throws Exception;
        void restore(T previous)throws Exception;
        void persist(String uid)throws Exception;
        void abandon();
    }
    boolean run(T candidate,String expectedUid,BooleanSupplier current,Object lock,Port<T> port)throws Exception{
        if(candidate==null||!expectedUid.equals(port.uid(candidate)))throw new IllegalStateException("The approved Explorer account did not match.");
        final T previous=port.current();
        synchronized(lock){if(!current.getAsBoolean())return false;port.mark();}
        boolean accepted=false;
        try{
            port.adopt(candidate); // May finish after Cancel. Always drain it.
            synchronized(lock){if(current.getAsBoolean()&&expectedUid.equals(port.uid(port.current()))){port.persist(expectedUid);accepted=true;}}
            return accepted;
        }finally{
            if(!accepted){try{port.restore(previous);}catch(Exception error){port.abandon();throw error;}}
        }
    }
}
